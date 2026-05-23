import { describe, it, before, after } from 'mocha';
import assert from 'node:assert/strict';
import sinon from 'sinon';
import fetchMock from 'fetch-mock';
import index from '../lib/index.js';
import utility from '../lib/utility.js';

const sinonBodyMatcher = (expectedUrl, expected) => {
  return ({ url, options }) => {
    if (typeof expectedUrl === 'string' ? url !== expectedUrl : !expectedUrl.test(url)) return false;
    return sinon.match(expected).test(JSON.parse(options.body));
  };
};

describe('lib/index', () => {
  const TEST_CTX = {
    filePath: '/PATH/TO/FILE',
    fileName: 'FILE',
    fileHandle: 'FD',
    fileSize: 12345,
    fileChecksum: 'FILE_CHECKSUM',
    assetDescription: Buffer.from('ASSET_DESCRIPTION_CONTENT'),
    assetDescriptionSize: 25,
    assetDescriptionChecksum: 'ASSET_DESCRIPTION_CHECKSUM',
    appleId: 'APPLE_ID',
    bundleId: 'BUNDLE_ID',
    bundleVersion: 'BUNDLE_VERSION',
    bundleShortVersion: 'BUNDLE_SHORT_VERSION',
    infoPlist: { fileName: 'Payload/Test.app/Info.plist', data: Buffer.from('INFO_CONTENT') },
    mobileProvision: { fileName: 'Payload/Test.app/embedded.mobileprovision', data: Buffer.from('MOBILEPROVISION_CONTENT') },
    sessionId: 'SESSION_ID',
    sharedSecret: 'SECRET',
    appName: 'APP_NAME',
    appIconUrl: 'ICON_URL',
    providerPublicId: 'PROVIDER_ID',
    buildId: 'BUILD_ID',
    dsToken: 'DS_TOKEN',
    dsTokenName: 'DS_TOKEN_NAME',
  };

  const TEST_OPERATION = {
    url: 'https://example.com/upload',
    method: 'PUT',
    offset: 0,
    length: TEST_CTX.assetDescriptionSize,
    requestHeaders: [
      { name: 'Content-Type', value: 'application/octet-stream' },
    ],
  };

  describe('constructError()', () => {
    it('should return a formatted error', () => {
      let err = index.constructError('MESSAGE', { data: { ErrorMessage: 'RESPONSE_ERROR' } });
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'MESSAGE\nRESPONSE_ERROR');
    });
  });

  describe('constructDSError()', () => {
    it('should return a formatted error', async () => {
      const res = new Response(JSON.stringify({ errors: [{ detail: 'RESPONSE_ERROR' }] }), { status: 400 });
      let err = await index.constructDSError('MESSAGE', res);
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'MESSAGE\nRESPONSE_ERROR');
    });

    it('should handle response body not being JSON', async () => {
      const res = new Response('Invalid JSON', { status: 400 });
      let err = await index.constructDSError('MESSAGE', res);
      assert.ok(err instanceof Error);
      assert.equal(err.message, 'MESSAGE');
    });
  });

  describe('generateAssetDescription()', () => {
    before(() => {
      sinon.stub(utility, 'getFileStats').withArgs(TEST_CTX.fileHandle).resolves({
        size: TEST_CTX.fileSize,
      });
      sinon.stub(utility, 'getFileMD5').withArgs(TEST_CTX.fileHandle).resolves(TEST_CTX.fileChecksum);
      sinon.stub(utility, 'makeBinaryPlist').returns(TEST_CTX.assetDescription);
      sinon.stub(utility, 'getMD5HashString').withArgs(TEST_CTX.assetDescription).returns(TEST_CTX.assetDescriptionChecksum);
    });

    after(() => {
      sinon.restore();
    });

    it('should generate asset description with correct properties', async () => {
      const ctx = Object.assign({}, TEST_CTX, {
        fileName: undefined,
        fileSize: undefined,
        fileChecksum: undefined,
        assetDescription: undefined,
        assetDescriptionSize: undefined,
        assetDescriptionChecksum: undefined,
      });
      await index.generateAssetDescription(ctx);

      sinon.assert.match(ctx, {
        fileName: TEST_CTX.fileName,
        fileSize: TEST_CTX.fileSize,
        fileChecksum: TEST_CTX.fileChecksum,
        assetDescription: TEST_CTX.assetDescription,
        assetDescriptionSize: TEST_CTX.assetDescriptionSize,
        assetDescriptionChecksum: TEST_CTX.assetDescriptionChecksum,
      });
    });
  });

  describe('makeSoftwareServiceRequest()', () => {
    before(() => {
      fetchMock
        .mockGlobal()
        .route(
          sinonBodyMatcher(index.SOFTWARE_SERVICE_URL, {
            jsonrpc: '2.0',
            method: 'test',
            id: sinon.match.string,
            params: {},
          }), { result: { Success: true } }, { name: 'service-request' });
    });

    after(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should make the appropriate HTTP request and return data', async () => {
      let res = await index.makeSoftwareServiceRequest({ ...TEST_CTX }, 'test', {});
      sinon.assert.match(res, { data: { Success: true } });
    });
  });

  describe('authenticateForSession()', () => {
    before(() => {
      fetchMock
        .mockGlobal()
        .route(
          sinonBodyMatcher(index.SOFTWARE_SERVICE_URL, {
            jsonrpc: '2.0',
            method: 'authenticateForSession',
            id: sinon.match.string,
            params: { Username: 'user@example.com', Password: 'password123' },
          }), { result: { SessionId: TEST_CTX.sessionId, SharedSecret: TEST_CTX.sharedSecret } }, { name: 'auth-success' })
        .route(index.SOFTWARE_SERVICE_URL, { result: { Success: false } }, { name: 'auth-fail', overwriteRoutes: false });
    });

    after(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should authenticate and set session id and shared secret', async () => {
      const ctx = {
        username: 'user@example.com',
        password: 'password123',
      };
      await index.authenticateForSession(ctx);
      sinon.assert.match(ctx, { sessionId: TEST_CTX.sessionId, sharedSecret: TEST_CTX.sharedSecret });
    });

    it('should reject on failure', async () => {
      const ctx = {
        username: 'user@example.com',
        password: 'wrongpassword',
      };
      await assert.rejects(index.authenticateForSession(ctx));
    });
  });

  describe('generateAppleConnectToken()', () => {
    before(() => {
      fetchMock
        .mockGlobal()
        .route(
          sinonBodyMatcher(index.SOFTWARE_SERVICE_URL, {
            jsonrpc: '2.0',
            method: 'generateAppleConnectToken',
            id: sinon.match.string,
            params: { Username: 'user@example.com', Password: 'password123' },
          }), { result: { DSToken: TEST_CTX.dsToken, DSTokenCookieName: TEST_CTX.dsTokenName } }, { name: 'token-success' })
        .route(index.SOFTWARE_SERVICE_URL, { result: { Success: false } }, { name: 'token-fail', overwriteRoutes: false });
    });

    after(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should generate apple connect token', async () => {
      const ctx = {
        username: 'user@example.com',
        password: 'password123',
      };
      await index.generateAppleConnectToken(ctx);
      sinon.assert.match(ctx, { dsToken: TEST_CTX.dsToken, dsTokenName: TEST_CTX.dsTokenName });
    });

    it('should reject on failure', async () => {
      const ctx = {
        username: 'user@example.com',
        password: 'wrongpassword',
      };
      await assert.rejects(index.generateAppleConnectToken(ctx));
    });
  });

  describe('lookupSoftwareForBundleId()', () => {
    before(() => {
      fetchMock
        .mockGlobal()
        .route(
          sinonBodyMatcher(index.SOFTWARE_SERVICE_URL, {
            jsonrpc: '2.0',
            method: 'lookupSoftwareForBundleId',
            id: sinon.match.string,
            params: {
              BundleId: TEST_CTX.bundleId,
            },
          }), {
            result: {
              Success: true,
              ProviderPublicId: TEST_CTX.providerPublicId,
              Attributes: [{ AppleID: TEST_CTX.appleId, Application: TEST_CTX.appName, IconURL: TEST_CTX.appIconUrl }],
            },
          }, { name: 'lookup-success' })
        .route(index.SOFTWARE_SERVICE_URL, {
          result: {
            Success: false,
          },
        }, { name: 'lookup-fail', overwriteRoutes: false });
    });

    after(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should lookup software for bundle id', async () => {
      const ctx = {
        bundleId: TEST_CTX.bundleId,
        sessionId: TEST_CTX.sessionId,
        sharedSecret: TEST_CTX.sharedSecret,
      };
      await index.lookupSoftwareForBundleId(ctx);
      sinon.assert.match(ctx, {
        appleId: TEST_CTX.appleId,
        appName: TEST_CTX.appName,
        appIconUrl: TEST_CTX.appIconUrl,
        providerPublicId: TEST_CTX.providerPublicId,
      });
    });

    it('should reject on failure', async () => {
      const ctx = {
        bundleId: 'WRONG_BUNDLE_ID',
        sessionId: TEST_CTX.sessionId,
        sharedSecret: TEST_CTX.sharedSecret,
      };
      await assert.rejects(index.lookupSoftwareForBundleId(ctx));
    });
  });

  describe('checkBuilds()', () => {
    before(() => {
      const buildUrl = /^https:\/\/contentdelivery\.itunes\.apple\.com\/MZContentDeliveryService\/iris\/provider\/.+\/v1\/builds(\?|$)/;

      fetchMock
        .mockGlobal()
        .route(buildUrl, {
          data: [{
            id: TEST_CTX.buildId,
            attributes: {
              uploadedDate: null,
            },
          }],
        }, { name: 'builds-fresh', repeat: 1 })
        .route(buildUrl, {
          data: [{
            id: TEST_CTX.buildId,
            attributes: {
              uploadedDate: '2020-01-01',
            },
          }],
        }, { name: 'builds-uploaded', repeat: 1, overwriteRoutes: false })
        .route(buildUrl, {
          status: 400,
          body: { errors: [{ detail: 'Build lookup failed' }] },
        }, { name: 'builds-failed', repeat: 1, overwriteRoutes: false });
    });

    after(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should set buildId when build exists', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await index.checkBuilds(ctx);
      sinon.assert.match(ctx, { buildId: TEST_CTX.buildId });
    });

    it('should reject when build is already uploaded', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await assert.rejects(index.checkBuilds(ctx), /already uploaded/);
    });

    it('should reject on lookup failure', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await assert.rejects(index.checkBuilds(ctx));
    });
  });

  describe('registerBuild()', () => {
    before(() => {
      const registerBuildUrl = /^https:\/\/contentdelivery\.itunes\.apple\.com\/MZContentDeliveryService\/iris\/provider\/.+\/v1\/builds$/;

      fetchMock
        .mockGlobal()
        .route(
          sinonBodyMatcher(registerBuildUrl, {
            data: {
              attributes: {
                cfBundleShortVersionString: TEST_CTX.bundleShortVersion,
                cfBundleVersion: TEST_CTX.bundleVersion,
                platform: 'IOS',
              },
              relationships: sinon.match.object,
              type: 'builds',
            },
          }), {
            status: 201,
            body: {
              data: {
                id: TEST_CTX.buildId,
              },
            },
          }, { name: 'register-success' })
        .route(registerBuildUrl, {
          status: 400,
          body: { errors: [{ detail: 'Registration failed' }] },
        }, { name: 'register-fail', overwriteRoutes: false });
    });

    after(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should register build and set buildId', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await index.registerBuild(ctx);
      sinon.assert.match(ctx, { buildId: TEST_CTX.buildId });
    });

    it('should reject on registration failure', async () => {
      const ctx = Object.assign({}, TEST_CTX, { bundleVersion: 'INVALID_VERSION' });
      await assert.rejects(index.registerBuild(ctx));
    });
  });

  describe('getBuildStatus()', () => {
    before(() => {
      const statusUrl = /^https:\/\/contentdelivery\.itunes\.apple\.com\/MZContentDeliveryService\/iris\/provider\/.+\/v1\/builds\/.+$/;

      fetchMock
        .mockGlobal()
        .route(statusUrl, {
          data: {
            attributes: {
              processingState: 'PROCESSING',
            },
          },
        }, { name: 'status-processing', repeat: 1 })
        .route(statusUrl, {
          status: 400,
          body: { errors: [{ detail: 'Build status lookup failed' }] },
        }, { name: 'status-fail', repeat: 1, overwriteRoutes: false });
    });

    after(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should return build processing state', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      const state = await index.getBuildStatus(ctx);
      assert.equal(state, 'PROCESSING');
    });

    it('should reject on lookup failure', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await assert.rejects(index.getBuildStatus(ctx));
    });
  });

  describe('registerAssetDescriptionDeliveryFile()', () => {
    before(() => {
      const deliveryFilesUrl = /^https:\/\/contentdelivery\.itunes\.apple\.com\/MZContentDeliveryService\/iris\/provider\/.+\/v1\/buildDeliveryFiles$/;

      fetchMock
        .mockGlobal()
        .route(
          sinonBodyMatcher(deliveryFilesUrl, {
            data: {
              attributes: sinon.match({ assetType: 'ASSET_DESCRIPTION', sourceFileChecksum: TEST_CTX.assetDescriptionChecksum }),
              relationships: sinon.match.object,
              type: 'buildDeliveryFiles',
            },
          }), {
            status: 201,
            body: {
              data: {
                id: 'DELIVERY_ID',
                attributes: {
                  uploadOperations: [TEST_OPERATION],
                },
              },
            },
          }, { name: 'delivery-desc-success' })
        .route(deliveryFilesUrl, {
          status: 400,
          body: { errors: [{ detail: 'Registration failed' }] },
        }, { name: 'delivery-desc-fail', overwriteRoutes: false });
    });

    after(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should register asset description delivery file', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await index.registerAssetDescriptionDeliveryFile(ctx);
      sinon.assert.match(ctx, {
        assetDescriptionDeliveryId: 'DELIVERY_ID',
        assetDescriptionUploadOperations: [TEST_OPERATION],
      });
    });

    it('should reject on registration failure', async () => {
      const ctx = Object.assign({}, TEST_CTX, { assetDescriptionChecksum: undefined });
      await assert.rejects(index.registerAssetDescriptionDeliveryFile(ctx));
    });
  });

  describe('registerAssetDeliveryFile()', () => {
    before(() => {
      const deliveryFilesUrl = /^https:\/\/contentdelivery\.itunes\.apple\.com\/MZContentDeliveryService\/iris\/provider\/.+\/v1\/buildDeliveryFiles$/;

      fetchMock
        .mockGlobal()
        .route(
          sinonBodyMatcher(deliveryFilesUrl, {
            data: {
              attributes: sinon.match({ assetType: 'ASSET', sourceFileChecksum: TEST_CTX.fileChecksum }),
              relationships: sinon.match.object,
              type: 'buildDeliveryFiles',
            },
          }), {
            status: 201,
            body: {
              data: {
                id: 'ASSET_DELIVERY_ID',
                attributes: {
                  uploadOperations: [TEST_OPERATION],
                },
              },
            },
          }, { name: 'delivery-asset-success' })
        .route(deliveryFilesUrl, {
          status: 400,
          body: { errors: [{ detail: 'Registration failed' }] },
        }, { name: 'delivery-asset-fail', overwriteRoutes: false });
    });

    after(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should register asset delivery file', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await index.registerAssetDeliveryFile(ctx);
      sinon.assert.match(ctx, {
        assetDeliveryId: 'ASSET_DELIVERY_ID',
        assetUploadOperations: [TEST_OPERATION],
      });
    });

    it('should reject on registration failure', async () => {
      const ctx = Object.assign({}, TEST_CTX, { fileChecksum: undefined });
      await assert.rejects(index.registerAssetDeliveryFile(ctx));
    });
  });

  describe('uploadCompleted()', () => {
    before(() => {
      const patchDeliveryUrl = /^https:\/\/contentdelivery\.itunes\.apple\.com\/MZContentDeliveryService\/iris\/provider\/.+\/v1\/buildDeliveryFiles\/.+$/;

      fetchMock
        .mockGlobal()
        .route(
          sinonBodyMatcher(patchDeliveryUrl, {
            data: {
              attributes: sinon.match.object,
              id: 'DELIVERY_ID',
              type: 'buildDeliveryFiles',
            },
          }), 200, { name: 'completed-success' })
        .route(patchDeliveryUrl, {
          status: 400,
          body: { errors: [{ detail: 'Failed to mark upload completed' }] },
        }, { name: 'completed-fail', overwriteRoutes: false });
    });

    after(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should mark upload as completed', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await index.uploadCompleted(ctx, 'DELIVERY_ID');
    });

    it('should reject on failure', async () => {
      const ctx = Object.assign({}, TEST_CTX);
      await assert.rejects(index.uploadCompleted(ctx, 'WRONG_ID'));
    });
  });

  describe('executeOperation()', () => {
    before(() => {
      fetchMock
        .mockGlobal()
        .route('https://example.com/upload', 200, { name: 'put-success' })
        .route(/^https:\/\/example\.com\/.*$/, 400, { name: 'put-fail', overwriteRoutes: false });

      sinon.stub(utility, 'getFilePart')
        .resolves(Buffer.alloc(TEST_OPERATION.length));
    });

    after(() => {
      sinon.restore();
      fetchMock.hardReset();
    });

    it('should execute upload operation for asset', async () => {
      const ctx = Object.assign({ bytesSent: 0 }, TEST_CTX);
      await index.executeOperation({ ctx, assetType: 'ASSET', operation: TEST_OPERATION });
      sinon.assert.match(ctx, { bytesSent: TEST_OPERATION.length });
    });

    it('should execute upload operation for asset description', async () => {
      const ctx = Object.assign({ bytesSent: 0 }, TEST_CTX);
      await index.executeOperation({ ctx, assetType: 'ASSET_DESCRIPTION', operation: TEST_OPERATION });
      sinon.assert.match(ctx, { bytesSent: TEST_OPERATION.length });
    });

    it('should do nothing on unknown asset type', async () => {
      const ctx = Object.assign({ bytesSent: 0 }, TEST_CTX);
      await index.executeOperation({ ctx, assetType: 'UNKNOWN', operation: TEST_OPERATION });
      sinon.assert.match(ctx, { bytesSent: 0 });
    });

    it('should reject on HTTP error', async () => {
      const ctx = Object.assign({ bytesSent: 0 }, TEST_CTX);
      const errorOp = Object.assign({}, TEST_OPERATION, { url: 'https://example.com/error' });
      await assert.rejects(index.executeOperation({ ctx, assetType: 'ASSET', operation: errorOp }), /Upload failed/);
    });
  });
});
