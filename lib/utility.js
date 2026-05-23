import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import plist from 'simple-plist';
import prettyBytes from 'pretty-bytes';
import { buffer } from 'node:stream/consumers';

const INFO_PLIST_FILE_PATTERN = /^Payload\/[^/]*.app\/Info\.plist$/;
const MOBILE_PROVISION_FILE_PATTERN = /^Payload\/[^/]*.app\/embedded\.mobileprovision$/;

/**
 * @typedef {object} FileHandleWithPath
 * @property {string} path - The file path associated with the file handle.
 * @augments fs.FileHandle
 */

/**
 * @callback downloadProgressCallback
 * @param {number} current Downloaded bytes so far
 * @param {number} total Total bytes to download
 */

/**
 * Converts data to binary plist format
 * @param {object} data Data to convert to binary plist
 * @returns {Buffer} Binary plist data
 */
function makeBinaryPlist(data) {
  return plist.bplistCreator(data);
};

/**
 * Generates a unique ID string with current timestamp in YYYYMMDDHHmmss-sss format
 * @returns {string} Unique ID string
 */
function generateIDString() {
  // YYYYMMDDHHmmss-sss
  return new Date().toISOString().replace(/-|:|T|Z/g, '').replace('.', '-');
};

/**
 * Creates an MD5 digest from session credentials
 * @param {string} sessionId Session identifier
 * @param {string} requestChecksum Checksum of the request
 * @param {string} requestId Request identifier
 * @param {string} sharedSecret Shared secret key
 * @returns {string} Hexadecimal MD5 digest
 */
function makeSessionDigest(sessionId, requestChecksum, requestId, sharedSecret) {
  return crypto.createHash('md5')
    .update(sessionId)
    .update(requestChecksum)
    .update(requestId)
    .update(sharedSecret)
    .digest('hex');
};

/**
 * Opens a file and returns a handle to it
 * @param {fs.PathLike} path Path to file
 * @param {string | number} flags file system flags
 * @returns {Promise<FileHandleWithPath>} Handle to opened file
 */
async function openFile(path, flags = 'r') {
  const fileHandle = await fs.open(path, flags);
  fileHandle.path = path;
  return fileHandle;
};

/**
 * Closes a file handle
 * @param {fs.FileHandle} fileHandle File handle to close
 * @returns {Promise<void>}
 */
function closeFile(fileHandle) {
  return fileHandle.close();
};

/**
 * Extracts file data from a ZIP archive matching a pattern
 * @param {fs.FileHandle} fileHandle File handle of the ZIP file
 * @param {RegExp} fileNamePattern Regular expression pattern to match file names
 * @returns {Promise<{fileName: string, data: Buffer} | null>} Matched file data or null if not found
 */
function readFileDataFromZip(fileHandle, fileNamePattern) {
  return new Promise((resolve, reject) => {
    yauzl.fromFd(fileHandle.fd, { autoClose: false, lazyEntries: true }, (err, zipFile) => {
      if (err) return reject(err);
      zipFile.on('error', reject);
      zipFile.on('entry', (entry) => {
        if (fileNamePattern.test(entry.fileName)) {
          zipFile.openReadStream(entry, async (err, stream) => {
            if (err) return reject(err);
            const data = await buffer(stream);
            resolve({ fileName: entry.fileName, data });
          });
        }
        else {
          zipFile.readEntry();
        }
      });
      zipFile.on('end', () => {
        resolve(null);
      });
      zipFile.readEntry();
    });
  });
};

/**
 * Extracts bundle ID and version information from an IPA file
 * @param {object} ctx Context object containing file handle; will be populated with bundleId, bundleVersion, and bundleShortVersion
 * @throws {Error} If Info.plist or required bundle info is not found
 * @returns {Promise<void>}
 */
async function extractBundleIdAndVersion(ctx) {
  try {
    ctx.infoPlist = await utility.readFileDataFromZip(ctx.fileHandle, INFO_PLIST_FILE_PATTERN);
    ctx.mobileProvision = await utility.readFileDataFromZip(ctx.fileHandle, MOBILE_PROVISION_FILE_PATTERN);
  }
  catch {
    // Ignore this error, handled below.
  }

  if (!ctx.infoPlist || ctx.infoPlist.data.length === 0) {
    throw new Error('Info.plist not found');
  }

  if (!ctx.mobileProvision || ctx.mobileProvision.data.length === 0) {
    throw new Error('embedded.mobileprovision not found');
  }

  let infoPlistContent;
  try {
    infoPlistContent = plist.parse(ctx.infoPlist.data, 'Info.plist');
  }
  catch {
    throw new Error('Failed to parse Info.plist');
  }

  if (!infoPlistContent?.CFBundleIdentifier || !infoPlistContent?.CFBundleVersion || !infoPlistContent?.CFBundleShortVersionString) {
    throw new Error('Bundle info not found in Info.plist');
  }

  ctx.bundleId = infoPlistContent.CFBundleIdentifier;
  ctx.bundleVersion = infoPlistContent.CFBundleVersion;
  ctx.bundleShortVersion = infoPlistContent.CFBundleShortVersionString;
};

/**
 * Ensures the temporary directory exists, creating it if necessary
 * @returns {Promise<string>} Path to the temporary directory
 */
async function ensureTempDir() {
  const tempDir = path.join(os.tmpdir(), 'ios-uploader');
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
};

/**
 * Downloads a file from a URL to a temporary location
 * @param {string | URL} fileUrl URL of the file to download
 * @param {downloadProgressCallback} [onProgress] Callback function called during download
 * @returns {Promise<FileHandleWithPath>} Handle to the downloaded file
 */
async function downloadTempFile(fileUrl, onProgress) {
  const res = await fetch(fileUrl);

  if (!res.ok) {
    throw new Error(`Failed to fetch ${fileUrl}: ${res.statusText}`);
  }

  const newFilePath = path.join(
    await utility.ensureTempDir(),
    Math.random().toString(16).substr(2, 8) + '.ipa',
  );

  const stream = Readable.fromWeb(res.body);
  const contentLength = Number(res.headers.get('content-length') ?? 0);
  const fileHandle = await utility.openFile(newFilePath, 'w+');

  let downloaded = 0;
  if (contentLength > 0) {
    onProgress?.(0, contentLength);
  }

  for await (const chunk of stream) {
    await fileHandle.write(chunk);
    if (contentLength > 0) {
      onProgress?.(downloaded += chunk.length, contentLength);
    }
  }

  // Flush to disk
  await fileHandle.sync();

  // Attach path to file handle for later cleanup
  fileHandle.path = newFilePath;

  return fileHandle;
};

/**
 * Removes a temporary file
 * @param {string} filePath Path to the file to remove
 * @returns {Promise<void>}
 */
async function removeTempFile(filePath) {
  return fs.unlink(filePath);
};

/**
 * Gets file statistics for a file handle
 * @param {fs.FileHandle} fileHandle File handle to get stats for
 * @returns {Promise<fs.Stats>} File statistics
 */
function getFileStats(fileHandle) {
  return fileHandle.stat();
};

/**
 * Computes the MD5 hash of a file
 * @param {fs.FileHandle} fileHandle File handle to hash
 * @returns {Promise<string>} Hexadecimal MD5 hash
 */
async function getFileMD5(fileHandle) {
  const input = fileHandle.createReadStream({ start: 0, autoClose: false });
  const hash = crypto.createHash('md5');
  for await (const chunk of input) {
    hash.update(chunk);
  }
  return hash.digest('hex');
};

/**
 * Reads a specific part of a file
 * @param {fs.FileHandle} fileHandle File handle to read from
 * @param {number} offset Byte offset to start reading from
 * @param {number} length Number of bytes to read
 * @returns {Promise<Buffer>} Buffer containing the file data
 */
async function getFilePart(fileHandle, offset, length) {
  const buffer = Buffer.allocUnsafe(length);
  await fileHandle.read(buffer, { position: offset, length });
  return buffer;
};

/**
 * Computes the MD5 hash of data as a hexadecimal string
 * @param {string | Buffer} data Data to hash
 * @returns {string} Hexadecimal MD5 hash
 */
function getMD5HashString(data) {
  return crypto.createHash('md5').update(data).digest('hex');
};

/**
 * Computes the MD5 hash of data as a buffer
 * @param {string | Buffer} data Data to hash
 * @returns {Buffer} MD5 hash buffer
 */
function getMD5HashBuffer(data) {
  return crypto.createHash('md5').update(data).digest();
};

/**
 * Calculates download speed and estimated time remaining
 * @param {number} bytes Number of bytes downloaded
 * @param {number} total Total bytes to download
 * @param {number} duration Elapsed time in milliseconds
 * @returns {object} Object with speed (string) and eta (string) properties
 */
function formatSpeedAndEta(bytes, total, duration) {
  return {
    speed: prettyBytes(Math.round((bytes / duration) * 1000)) + '/s',
    eta: Math.round(((total - bytes) / (bytes / duration)) / 1000) + 's',
  };
};

const utility = {
  closeFile,
  downloadTempFile,
  ensureTempDir,
  extractBundleIdAndVersion,
  formatSpeedAndEta,
  generateIDString,
  getFileMD5,
  getFilePart,
  getFileStats,
  getMD5HashBuffer,
  getMD5HashString,
  makeBinaryPlist,
  makeSessionDigest,
  openFile,
  readFileDataFromZip,
  removeTempFile,
};

export default utility;
