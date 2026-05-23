import { describe, it, before, beforeEach, after, afterEach } from 'mocha';
import assert from 'node:assert/strict';
import sinon from 'sinon';
import fs from 'node:fs/promises';
import stream from 'stream';
import yauzl from 'yauzl';
import fetchMock from 'fetch-mock';
import utility from '../lib/utility.js';

const TEST_PLIST = `
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleIdentifier</key>
    <string>BUNDLE_IDENTIFIER</string>
    <key>CFBundleVersion</key>
    <string>BUNDLE_VERSION</string>
    <key>CFBundleShortVersionString</key>
    <string>BUNDLE_SHORT_VERSION</string>
  </dict>
</plist>
`.trim();

const EMPTY_PLIST = `
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
  </dict>
</plist>
`.trim();

describe('lib/utility', () => {
  describe('generateIDString()', () => {
    let clock;

    before(() => {
      clock = sinon.useFakeTimers({
        now: new Date('2020-01-02T03:04:05.678Z'),
        shouldAdvanceTime: false,
      });
    });

    after(() => {
      clock.restore();
    });

    it('should correctly format ID based on current time', () => {
      assert.equal(utility.generateIDString(), '20200102030405-678');
    });
  });

  describe('makeBinaryPlist()', () => {
    it('should generate a valid binary plist', () => {
      const result = utility.makeBinaryPlist({ CFBundleIdentifier: 'BUNDLE_IDENTIFIER' });
      assert.ok(Buffer.isBuffer(result));
    });
  });

  describe('makeSessionDigest()', () => {
    it('should generate a valid digest string', () => {
      assert.equal(utility.makeSessionDigest('SESSION-ID', 'REQUEST_CHECKSUM', 'REQUEST-ID', 'SECRET'), 'af7b0121fe12199cdb5d765b73bd7cb5');
    });
  });

  describe('openFile()', () => {
    before(() => {
      let stub = sinon.stub(fs, 'open');
      stub.withArgs('VALIDPATH').resolves({ fd: 0 });
      stub.withArgs('WRONGPATH').rejects(new Error());
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve with file-descriptor on success', async () => {
      let fileHandle = await utility.openFile('VALIDPATH');
      assert.equal(fileHandle.fd, 0);
      assert.equal(fileHandle.path, 'VALIDPATH');
    });

    it('should reject with error on failure', async () => {
      await assert.rejects(utility.openFile('WRONGPATH'));
    });
  });

  describe('closeFile()', () => {
    it('should resolve on success', async () => {
      const fileHandleMock = { close: sinon.stub().resolves() };
      await utility.closeFile(fileHandleMock);
    });

    it('should reject with error on failure', async () => {
      const fileHandleMock = { close: sinon.stub().rejects(new Error('CLOSE_ERROR')) };
      await assert.rejects(utility.closeFile(fileHandleMock));
    });
  });

  describe('readFileDataFromZip()', () => {
    before(() => {
      let fromFdStub = sinon.stub(yauzl, 'fromFd');

      let zipFileOK = {
        on: () => { },
        openReadStream: () => { },
        readEntry: () => { },
      };

      let zipFileOKMock = sinon.mock(zipFileOK);
      let okEntry = { fileName: 'Payload/Test.app/Info.plist' };
      let okStream = new stream.Readable({
        read: function () {
          this.push(TEST_PLIST);
          this.push(null);
        },
      });
      zipFileOKMock.expects('readEntry').once().returns();
      zipFileOKMock.expects('openReadStream').withArgs(okEntry).yields(null, okStream);
      zipFileOKMock.expects('on').withArgs('entry').yields(okEntry);
      zipFileOKMock.expects('on').withArgs('error').returns();
      zipFileOKMock.expects('on').withArgs('end').returns();

      fromFdStub.withArgs(0, sinon.match.object)
        .yields(null, zipFileOK);

      let zipFileReadErr = {
        on: () => { },
        openReadStream: () => { },
        readEntry: () => { },
      };

      let zipFileReadErrMock = sinon.mock(zipFileReadErr);

      zipFileReadErrMock.expects('readEntry').once().returns();
      zipFileReadErrMock.expects('openReadStream').withArgs(okEntry).yields(new Error('STREAM_ERR'), null);
      zipFileReadErrMock.expects('on').withArgs('entry').yields(okEntry);
      zipFileReadErrMock.expects('on').withArgs('error').returns();
      zipFileReadErrMock.expects('on').withArgs('end').returns();

      fromFdStub.withArgs(1, sinon.match.object)
        .yields(null, zipFileReadErr);

      let zipFileWrong = {
        on: () => { },
        openReadStream: () => { },
        readEntry: () => { },
      };

      let zipFileWrongMock = sinon.mock(zipFileWrong);
      let wrongEntry = { fileName: 'Payload/Test.app/other.file' };
      zipFileWrongMock.expects('readEntry').once().returns();
      zipFileWrongMock.expects('openReadStream').never();
      zipFileWrongMock.expects('on').withArgs('entry').yields(wrongEntry);
      zipFileWrongMock.expects('on').withArgs('error').returns();
      zipFileWrongMock.expects('on').withArgs('end').yields();

      fromFdStub.withArgs(2, sinon.match.object)
        .yields(null, zipFileWrong);

      fromFdStub.withArgs(3, sinon.match.object)
        .yields(new Error('TEST_ERROR'), null);
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      let data = await utility.readFileDataFromZip({ fd: 0 }, /^Payload\/[^/]*.app\/Info\.plist$/);
      sinon.assert.match(data, sinon.match({ fileName: 'Payload/Test.app/Info.plist', data: sinon.match.instanceOf(Buffer) }));
    });

    it('should throw if unable to open read stream', async () => {
      await assert.rejects(utility.readFileDataFromZip({ fd: 1 }, /^Payload\/[^/]*.app\/Info\.plist$/), { message: 'STREAM_ERR' });
    });

    it('should resolve to null if not found', async () => {
      let data = await utility.readFileDataFromZip({ fd: 2 }, /^Payload\/[^/]*.app\/Info\.plist$/);
      sinon.assert.match(data, null);
    });

    it('should throw if unable to read file', async () => {
      await assert.rejects(utility.readFileDataFromZip({ fd: 3 }, /^Payload\/[^/]*.app\/Info\.plist$/), { message: 'TEST_ERROR' });
    });
  });

  describe('extractBundleIdAndVersion()', () => {
    before(() => {
      let readFileDataFromZipStub = sinon.stub(utility, 'readFileDataFromZip');

      readFileDataFromZipStub
        .withArgs({ fd: 0 }, /^Payload\/[^/]*.app\/Info\.plist$/)
        .resolves({ data: Buffer.from(TEST_PLIST), fileName: 'Payload/Test.app/Info.plist', path: 'Test.app/Info.plist' });

      readFileDataFromZipStub
        .withArgs({ fd: 0 }, /^Payload\/[^/]*.app\/embedded\.mobileprovision$/)
        .resolves({ data: Buffer.from('MOBILEPROVISION_CONTENT'), fileName: 'Payload/Test.app/embedded.mobileprovision', path: 'Test.app/embedded.mobileprovision' });

      readFileDataFromZipStub
        .withArgs({ fd: 1 }, sinon.match.regexp)
        .rejects(new Error('FILE_ERROR'));

      readFileDataFromZipStub
        .withArgs({ fd: 2 }, /^Payload\/[^/]*.app\/Info\.plist$/)
        .resolves({ data: Buffer.from('INVALID'), fileName: 'Payload/Test.app/Info.plist', path: 'Test.app/Info.plist' });

      readFileDataFromZipStub
        .withArgs({ fd: 2 }, /^Payload\/[^/]*.app\/embedded\.mobileprovision$/)
        .resolves(null);

      readFileDataFromZipStub
        .withArgs({ fd: 3 }, /^Payload\/[^/]*.app\/Info\.plist$/)
        .resolves({ data: Buffer.from('INVALID'), fileName: 'Payload/Test.app/Info.plist', path: 'Test.app/Info.plist' });

      readFileDataFromZipStub
        .withArgs({ fd: 3 }, /^Payload\/[^/]*.app\/embedded\.mobileprovision$/)
        .resolves({ data: Buffer.from('MOBILEPROVISION_CONTENT'), fileName: 'Payload/Test.app/embedded.mobileprovision', path: 'Test.app/embedded.mobileprovision' });

      readFileDataFromZipStub
        .withArgs({ fd: 4 }, /^Payload\/[^/]*.app\/Info\.plist$/)
        .resolves({ data: Buffer.from(EMPTY_PLIST), fileName: 'Payload/Test.app/Info.plist', path: 'Test.app/Info.plist' });

      readFileDataFromZipStub
        .withArgs({ fd: 4 }, /^Payload\/[^/]*.app\/embedded\.mobileprovision$/)
        .resolves({ data: Buffer.from('MOBILEPROVISION_CONTENT'), fileName: 'Payload/Test.app/embedded.mobileprovision', path: 'Test.app/embedded.mobileprovision' });
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      const ctx = { fileHandle: { fd: 0 } };
      await utility.extractBundleIdAndVersion(ctx);
      sinon.assert.match(ctx, {
        bundleId: 'BUNDLE_IDENTIFIER',
        bundleVersion: 'BUNDLE_VERSION',
        bundleShortVersion: 'BUNDLE_SHORT_VERSION',
        infoPlist: sinon.match.object,
        mobileProvision: sinon.match.object,
      });
    });

    it('should reject with error on failure 1', async () => {
      await assert.rejects(utility.extractBundleIdAndVersion({ fileHandle: { fd: 1 } }), { message: 'Info.plist not found' });
    });

    it('should reject with error on failure 2', async () => {
      await assert.rejects(utility.extractBundleIdAndVersion({ fileHandle: { fd: 2 } }), { message: 'embedded.mobileprovision not found' });
    });

    it('should reject with error on failure 3', async () => {
      await assert.rejects(utility.extractBundleIdAndVersion({ fileHandle: { fd: 3 } }), { message: 'Failed to parse Info.plist' });
    });

    it('should reject with error on failure 4', async () => {
      await assert.rejects(utility.extractBundleIdAndVersion({ fileHandle: { fd: 4 } }), { message: 'Bundle info not found in Info.plist' });
    });
  });

  describe('ensureTempDir()', () => {
    before(() => {
      let stub = sinon.stub(fs, 'mkdir');
      stub.withArgs(sinon.match.string, { recursive: true }).resolves();
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      let res = await utility.ensureTempDir();
      sinon.assert.match(res, sinon.match.string);
    });
  });

  describe('downloadTempFile()', () => {
    let fileHandle;
    beforeEach(() => {
      fetchMock
        .mockGlobal()
        .route('http://example.com/app.ipa', { body: 'DATA', headers: { 'content-length': 1 } }, { name: 'lookup-success' })
        .route('http://example.com/app-no-cl.ipa', new Response('DATA'), { name: 'lookup-success-no-cl' })
        .route('http://example.com/app-not-found.ipa', 404, { name: 'lookup-not-found' });

      fileHandle = { fd: 0, path: 'PATH', write: sinon.stub().resolves(), sync: sinon.stub().resolves() };

      let ensureTempDirStub = sinon.stub(utility, 'ensureTempDir');
      ensureTempDirStub.resolves('PATH');

      let openFileStub = sinon.stub(utility, 'openFile');
      openFileStub.resolves(fileHandle);
    });

    afterEach(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should resolve on success', async () => {
      const onProgressCallback = sinon.spy();
      let res = await utility.downloadTempFile('http://example.com/app.ipa', onProgressCallback);
      sinon.assert.called(fileHandle.write);
      sinon.assert.calledOnce(fileHandle.sync);
      sinon.assert.match(res.path, 'PATH');
      sinon.assert.called(onProgressCallback);
    });

    it('should not call onProgress if content-length unknown', async () => {
      const onProgressCallback = sinon.spy();
      let res = await utility.downloadTempFile('http://example.com/app-no-cl.ipa', onProgressCallback);
      sinon.assert.called(fileHandle.write);
      sinon.assert.calledOnce(fileHandle.sync);
      sinon.assert.match(res.path, 'PATH');
      sinon.assert.notCalled(onProgressCallback);
    });

    it('should reject with error on failure', async () => {
      await assert.rejects(utility.downloadTempFile('http://example.com/app-not-found.ipa'));
    });
  });

  describe('removeTempFile()', () => {
    before(() => {
      let unlinkStub = sinon.stub(fs, 'unlink');
      unlinkStub.withArgs('FILE_PATH').resolves();
      unlinkStub.rejects();
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      await utility.removeTempFile('FILE_PATH');
    });

    it('should reject with error on failure', async () => {
      await assert.rejects(utility.removeTempFile());
    });
  });

  describe('getFileStats()', () => {
    let fileHandle;

    beforeEach(() => {
      fileHandle = { stat: sinon.stub() };
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      fileHandle.stat.withArgs().resolves({ size: 123 });
      let stats = await utility.getFileStats(fileHandle);
      assert.deepEqual(stats, { size: 123 });
    });

    it('should reject with error on failure', async () => {
      fileHandle.stat.withArgs().rejects(new Error());
      await assert.rejects(utility.getFileStats(fileHandle));
    });
  });

  describe('getFileMD5()', () => {
    let fileHandle;

    beforeEach(() => {
      fileHandle = { createReadStream: sinon.stub() };
    });

    after(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      fileHandle.createReadStream.withArgs({ start: 0, autoClose: false }).callsFake(() => {
        return new stream.Readable({
          read: function () {
            this.push('data');
            this.push(null);
          },
        });
      });

      let md5 = await utility.getFileMD5(fileHandle);
      assert.deepEqual(md5, '8d777f385d3dfec8815d20f7496026dc');
    });

    it('should reject with error on failure', async () => {
      fileHandle.createReadStream.withArgs({ start: 0, autoClose: false }).callsFake(() => {
        return new stream.Readable({
          read: function () {
            this.emit('error', new Error());
            this.push(null);
          },
        });
      });
      await assert.rejects(utility.getFileMD5(fileHandle));
    });
  });

  describe('getFilePart()', () => {
    let fileHandle;

    beforeEach(() => {
      fileHandle = { read: sinon.stub() };
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should resolve on success', async () => {
      fileHandle.read.withArgs(sinon.match.instanceOf(Buffer), { position: 0, length: 4 }).callsFake(async (buffer) => {
        buffer.write('PART');
      });

      let part = await utility.getFilePart(fileHandle, 0, 4);
      sinon.assert.calledOnce(fileHandle.read);
      assert.deepEqual(part, Buffer.from('PART'));
    });

    it('should reject with error on failure', async () => {
      fileHandle.read.withArgs(sinon.match.instanceOf(Buffer), { position: 0, length: 4 }).rejects(new Error());

      await assert.rejects(utility.getFilePart(fileHandle, 0, 4));
      sinon.assert.calledOnce(fileHandle.read);
    });
  });

  describe('getMD5HashString()', () => {
    it('should return correct md5 hash string', () => {
      assert.deepEqual(utility.getMD5HashString('data'), '8d777f385d3dfec8815d20f7496026dc');
    });
  });

  describe('getMD5HashBuffer()', () => {
    it('should return correct md5 hash buffer', () => {
      assert.deepEqual(utility.getMD5HashBuffer('data'), Buffer.from('8d777f385d3dfec8815d20f7496026dc', 'hex'));
    });
  });

  describe('formatSpeedAndEta()', () => {
    it('should correctly format B/s', () => {
      assert.deepEqual(utility.formatSpeedAndEta(10, 10, 1000), { eta: '0s', speed: '10 B/s' });
    });

    it('should correctly format kB/s', () => {
      assert.deepEqual(utility.formatSpeedAndEta(10000, 10000, 1000), { eta: '0s', speed: '10 kB/s' });
    });

    it('should correctly format MB/s', () => {
      assert.deepEqual(utility.formatSpeedAndEta(10000000, 10000000, 1000), { eta: '0s', speed: '10 MB/s' });
    });

    it('should correctly format eta', () => {
      assert.deepEqual(utility.formatSpeedAndEta(10, 1000, 1000), { eta: '99s', speed: '10 B/s' });
    });
  });
});
