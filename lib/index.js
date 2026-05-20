const path = require('path');

const utility = require('./utility');

const SOFTWARE_SERVICE_URL = 'https://contentdelivery.itunes.apple.com/WebObjects/MZLabelService.woa/json/MZITunesSoftwareService';

const USER_AGENT = 'iTMSTransporter/4.2.0';

/**
 * Construct error message using application error string and response object.
 * @param {String} message Application error message
 * @param {Object|undefined} response Response object from remote request,
 * used to extract error message if any.
 * @returns {Error} An error that can be thrown.
 */
function constructError(message, response) {
  let errorMessage = message;
  if (response && response.ErrorMessage) {
    errorMessage += '\n' + response.ErrorMessage;
  }
  return new Error(errorMessage);
}

/**
 * Construct error message using application error string and response object.
 * @param {String} message Application error message
 * @param {Object|undefined} response Response object from remote request,
 * used to extract error message if any.
 * @returns {Error} An error that can be thrown.
 */
async function constructDSError(message, response) {
  let errorMessage = message;
  if (response) {
    try {
      const body = await response.json();
      if (body?.errors?.[0]?.detail) {
        errorMessage += '\n' + body.errors[0].detail;
      }
    }
    catch {
      // ignore JSON parsing errors
    }
  }
  return new Error(errorMessage);
}

async function generateAssetDescription(ctx) {
  const fileStats = await utility.getFileStats(ctx.fileHandle);
  ctx.fileName = path.basename(ctx.filePath).replace(/[: ]/g, '_');
  ctx.fileChecksum = await utility.getFileMD5(ctx.fileHandle);
  ctx.fileSize = fileStats.size;

  const appStoreInfoData = {
    'product-metadata': {
      'archive-bytes': ctx.fileSize,
      'file-name': ctx.fileName,
      packages: [{
        bundles: [{
          CFBundleShortVersionString: ctx.bundleShortVersion,
          CFBundleVersion: ctx.bundleVersion,
          'bundle-identifier': ctx.bundleId,
          'bundle-path': ctx.bundlePath,
          bundles: [],
          icons: [],
          'platform-display-name': 'iOS App',
          'platform-id': 1,
        }],
        files: [{
          // 'file-command-output': {
          //   command: `/usr/bin/file ./${ctx.mobileProvision.path}`,
          //   stdout: `./${ctx.mobileProvision.path}: data`,
          // },
          'file-size': ctx.mobileProvision.data.length,
          'file-type': 'NSFileTypeRegular',
          'file-data': ctx.mobileProvision.data.toString('base64'),
          // 'has-resource-fork': false,
          // 'has-acls': false,
          // 'reason-codes': [-10000, -10300, -10109],
          // permissions: 420,
          uti: 'com.apple.mobileprovision',
          path: ctx.mobileProvision.path,
        }],
      }],
    },
  };

  ctx.assetDescription = utility.makeBinaryPlist(appStoreInfoData);
  ctx.assetDescriptionSize = ctx.assetDescription.length;
  ctx.assetDescriptionChecksum = utility.getMD5HashString(ctx.assetDescription);
}

async function makeSoftwareServiceRequest(ctx, method, params) {
  const requestId = utility.generateIDString();

  const request = {
    jsonrpc: '2.0',
    method,
    id: requestId,
    params,
  };

  const headers = {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
  };

  const body = JSON.stringify(request);
  const jsonChecksum = utility.getMD5HashBuffer(body);

  if (ctx.sessionId) {
    headers['x-request-id'] = requestId;
    headers['x-session-digest'] = utility.makeSessionDigest(ctx.sessionId, jsonChecksum, requestId, ctx.sharedSecret);
    headers['x-session-id'] = ctx.sessionId;
    headers['x-session-version'] = '2';
  }

  const res = await fetch(SOFTWARE_SERVICE_URL, {
    method: 'POST',
    headers,
    body,
  });

  return { data: (await res.json()).result, headers: res.headers };
}

async function makeContentDeliveryServiceProviderRequest(ctx, method, path, data) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
    Cookie: `${ctx.dsTokenName}=${ctx.dsToken}`,
  };

  const body = data ? JSON.stringify({ data }) : undefined;

  return fetch(`https://contentdelivery.itunes.apple.com/MZContentDeliveryService/iris/provider/${ctx.providerPublicId}/v1/${path}`, {
    method,
    headers,
    body,
  });
}

async function authenticateForSession(ctx) {
  let res = await makeSoftwareServiceRequest(ctx, 'authenticateForSession', {
    Username: ctx.username,
    Password: ctx.password,
  });

  if (res.data.SessionId && res.data.SharedSecret) {
    ctx.sessionId = res.data.SessionId;
    ctx.sharedSecret = res.data.SharedSecret;
  }
  else {
    throw constructError('Authentication failed!', res);
  }
}

async function generateAppleConnectToken(ctx) {
  let res = await makeSoftwareServiceRequest(ctx, 'generateAppleConnectToken', {
    Username: ctx.username,
    Password: ctx.password,
  });

  if (res.data.DSToken && res.data.DSTokenCookieName) {
    ctx.dsToken = res.data.DSToken;
    ctx.dsTokenName = res.data.DSTokenCookieName;
  }
  else {
    throw constructError('Authentication failed!', res);
  }
}

async function lookupSoftwareForBundleId(ctx) {
  let res = await makeSoftwareServiceRequest(ctx, 'lookupSoftwareForBundleId', {
    BundleId: ctx.bundleId,
  });

  if (!res.data.Success || res.data.Attributes.length < 1) {
    throw constructError('Application lookup failed!', res);
  }

  ctx.providerPublicId = res.data.ProviderPublicId;
  ctx.appleId = res.data.Attributes[0].AppleID;
  ctx.appName = res.data.Attributes[0].Application;
  ctx.appIconUrl = res.data.Attributes[0].IconURL;
}

async function checkBuilds(ctx) {
  const params = new URLSearchParams();
  params.append('filter[app]', ctx.appleId);
  params.append('filter[version]', ctx.bundleVersion);

  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'GET', `builds?${params}`);

  if (res.status === 200) {
    const { data } = await res.json();
    for (const build of data) {
      if (build.attributes.uploadedDate) {
        throw new Error(`A build with version ${ctx.bundleVersion} is already uploaded!`);
      }
      else {
        ctx.buildId = build.id;
        break;
      }
    }
  }
  else {
    throw await constructDSError('Failed to lookup existing build!', res);
  }
}

async function registerBuild(ctx) {
  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'POST', 'builds', {
    attributes: {
      cfBundleShortVersionString: ctx.bundleShortVersion,
      cfBundleVersion: ctx.bundleVersion,
      platform: 'IOS',
    },
    relationships: {
      app: {
        data: {
          id: ctx.appleId,
          type: 'apps',
        },
      },
    },
    type: 'builds',
  });

  if (res.status === 201) {
    const { data } = await res.json();
    ctx.buildId = data.id;
  }
  else {
    throw await constructDSError('Build registration failed!', res);
  }
}

async function getBuildStatus(ctx) {
  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'GET', `builds/${ctx.buildId}`);

  if (res.status === 200) {
    const { data } = await res.json();
    return data.attributes.processingState;
  }
  else {
    throw await constructDSError('Failed to get build status!', res);
  }
}

async function registerAssetDescriptionDeliveryFile(ctx) {
  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'POST', 'buildDeliveryFiles', {
    attributes: {
      assetType: 'ASSET_DESCRIPTION',
      fileName: 'AppStoreInfo.plist',
      fileSize: ctx.assetDescriptionSize,
      sourceFileChecksum: ctx.assetDescriptionChecksum,
      uti: 'com.apple.binary-property-list',
    },
    relationships: {
      build: {
        data: {
          id: ctx.buildId,
          type: 'builds',
        },
      },
    },
    type: 'buildDeliveryFiles',
  });

  if (res.status === 201) {
    const { data } = await res.json();
    ctx.assetDescriptionDeliveryId = data.id;
    ctx.assetDescriptionUploadOperations = data.attributes.uploadOperations;
  }
  else {
    throw await constructDSError('Failed to register asset description delivery file!', res);
  }
}

async function registerAssetDeliveryFile(ctx) {
  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'POST', 'buildDeliveryFiles', {
    attributes: {
      assetType: 'ASSET',
      fileName: ctx.fileName,
      fileSize: ctx.fileSize,
      sourceFileChecksum: ctx.fileChecksum,
      uti: 'com.apple.ipa',
    },
    relationships: {
      build: {
        data: {
          id: ctx.buildId,
          type: 'builds',
        },
      },
    },
    type: 'buildDeliveryFiles',
  });

  if (res.status === 201) {
    const { data } = await res.json();
    ctx.assetDeliveryId = data.id;
    ctx.assetUploadOperations = data.attributes.uploadOperations;
  }
  else {
    throw await constructDSError('Failed to register asset delivery file!', res);
  }
}

async function uploadCompleted(ctx, deliveryId) {
  let res = await makeContentDeliveryServiceProviderRequest(ctx, 'PATCH', `buildDeliveryFiles/${deliveryId}`, {
    attributes: {
      uploaded: true,
    },
    id: deliveryId,
    type: 'buildDeliveryFiles',
  });

  if (res.status !== 200) {
    throw await constructDSError('Failed to mark upload completed!', res);
  }
}

async function executeOperation({ ctx, assetType, operation }) {
  let data;

  if (assetType === 'ASSET_DESCRIPTION') {
    data = ctx.assetDescription.slice(operation.offset, operation.offset + operation.length);
  }
  else if (assetType === 'ASSET') {
    data = await utility.getFilePart(ctx.fileHandle, operation.offset, operation.length);
  }
  else {
    // Unknown file
    return;
  }

  let res;

  try {
    res = await fetch(operation.url, {
      method: operation.method,
      headers: {
        'User-Agent': USER_AGENT,
        ...operation.requestHeaders.reduce((obj, { name, value }) => ({ ...obj, [name]: value }), {}),
      },
      body: data,
    });
  }
  catch (err) {
    throw new Error('Upload failed!\n' + err.message);
  }

  if (res.status != 200) {
    throw new Error('Upload failed! (' + res.status + ')');
  }

  ctx.bytesSent += operation.length;
}

module.exports = {
  SOFTWARE_SERVICE_URL,
  constructError,
  generateAssetDescription,
  makeSoftwareServiceRequest,
  authenticateForSession,
  generateAppleConnectToken,
  lookupSoftwareForBundleId,
  checkBuilds,
  registerBuild,
  registerAssetDescriptionDeliveryFile,
  registerAssetDeliveryFile,
  uploadCompleted,
  getBuildStatus,
  executeOperation,
};
