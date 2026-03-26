import type {
  LicenseData,
  LicenseResponse,
  ProModuleMeta,
  SignedProModuleMeta,
} from '../shared/types.js';

export const STALE_LICENSE_TIMESTAMP = 1700000000000;

export const LICENSE_TEST_DATA: LicenseData = {
  license: {
    issuedAt: '2023-11-14T22:13:20.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    serverTime: '2023-11-14T22:13:20.000Z',
  },
  user: {
    id: 'user-1',
    username: 'demo@example.com',
    displayName: 'Demo User',
    hasPro: true,
  },
  spaces: [
    {
      id: 'space-1',
      name: 'Demo Space',
      type: 'personal',
      plan: {
        type: 'pro',
        expiresAt: '2099-01-01T00:00:00.000Z',
        trialDaysRemaining: null,
      },
      role: 'owner',
      features: ['clone-with-variables', 'hooks'],
    },
  ],
};

export const SIGNED_LICENSE_FIXTURE: LicenseResponse = {
  data: LICENSE_TEST_DATA,
  signature: {
    payload:
      'eyJkYXRhIjp7ImxpY2Vuc2UiOnsiaXNzdWVkQXQiOiIyMDIzLTExLTE0VDIyOjEzOjIwLjAwMFoiLCJleHBpcmVzQXQiOiIyMDk5LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCJzZXJ2ZXJUaW1lIjoiMjAyMy0xMS0xNFQyMjoxMzoyMC4wMDBaIn0sInVzZXIiOnsiaWQiOiJ1c2VyLTEiLCJ1c2VybmFtZSI6ImRlbW9AZXhhbXBsZS5jb20iLCJkaXNwbGF5TmFtZSI6IkRlbW8gVXNlciIsImhhc1BybyI6dHJ1ZX0sInNwYWNlcyI6W3siaWQiOiJzcGFjZS0xIiwibmFtZSI6IkRlbW8gU3BhY2UiLCJ0eXBlIjoicGVyc29uYWwiLCJwbGFuIjp7InR5cGUiOiJwcm8iLCJleHBpcmVzQXQiOiIyMDk5LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCJ0cmlhbERheXNSZW1haW5pbmciOm51bGx9LCJyb2xlIjoib3duZXIiLCJmZWF0dXJlcyI6WyJjbG9uZS13aXRoLXZhcmlhYmxlcyIsImhvb2tzIl19XX0sInRpbWVzdGFtcCI6MTcwMDAwMDAwMDAwMCwianRpIjoibGljZW5zZS10ZXN0LWp0aSIsImRldmljZUlkIjoiMTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYiLCJjbGllbnRUeXBlIjoiY2xpIn0=',
    sign:
      'ie/T3vo2I1t7Nn995ScjznLfuFMPONu5h873DF/G8WSVHfr+L+w0qZT9g7m7pg9+wsASIy7/EPU+DE5sec8k5BllZj3hWUsOPI5rG0hp9hGmxFrhZRXvTPrs1Ickxpg05l285O7jC2wOfm/jbE1aY+Iw+KZAVU7D3P/GdOF/FBQZzAoUjLMzwctYIpGxrHt5Jj8HSoFAQllHm0JDujUzwhpJ8PbBrh/6N3FENnsEjc0hi5nkAR4oaARNxwyp7WPRTqzOm/u7n3BN1Xg+GqnO8slILBMXdOCaYaCD5dt5/1353s0en3aCulb0xkHr8X5X5D6bbfmwuTv98KrnBxxUNA==',
    algorithm: 'RS256',
    timestamp: STALE_LICENSE_TIMESTAMP,
  },
};

export const CHECKER_TEST_DEVICE_ID = 'abcdef1234567890abcdef1234567890';

export const SIGNED_CHECKER_LICENSE_FIXTURE: LicenseResponse = {
  data: {
    ...LICENSE_TEST_DATA,
    spaces: [],
  },
  signature: {
    payload:
      'eyJkYXRhIjp7ImxpY2Vuc2UiOnsiaXNzdWVkQXQiOiIyMDIzLTExLTE0VDIyOjEzOjIwLjAwMFoiLCJleHBpcmVzQXQiOiIyMDk5LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCJzZXJ2ZXJUaW1lIjoiMjAyMy0xMS0xNFQyMjoxMzoyMC4wMDBaIn0sInVzZXIiOnsiaWQiOiJ1c2VyLTEiLCJ1c2VybmFtZSI6ImRlbW9AZXhhbXBsZS5jb20iLCJkaXNwbGF5TmFtZSI6IkRlbW8gVXNlciIsImhhc1BybyI6dHJ1ZX0sInNwYWNlcyI6W119LCJ0aW1lc3RhbXAiOjE3MDAwMDAwMDAwMDAsImp0aSI6ImNoZWNrZXItdGVzdC1qdGkiLCJkZXZpY2VJZCI6ImFiY2RlZjEyMzQ1Njc4OTBhYmNkZWYxMjM0NTY3ODkwIiwiY2xpZW50VHlwZSI6ImNsaSJ9',
    sign:
      'mrRGRsD4nOnYfF5veKRFzLEMhVGOIdye6AxPDPUH5poZ3t63n4MK2sx2m8Z81GpgvjtbI73G5J24V/7sFxjt+N4qCX9WDpO0IiclWWX+NABkff6gjLaPQ9VPknYOlC5kutYsjUWAIw+VvP9deNKmqXpeg0ILZ7O/hoiGzqZFd/4GVdcs68RRXO+MOUFXk05Lqz3uDOtjN1BP0bs1B0WQCzoiyduT/yMhLDQeLgvJ75+ywOHYPMv67Zo5VNLuCrDUBJihSY9k5G3Z58+SaXujRknN5j9twEN1oIyhcGsUmydCQuE7RZ3+OiZx5Lz3VfKPMI+k4MiRAz+KebinlN3daQ==',
    algorithm: 'RS256',
    timestamp: STALE_LICENSE_TIMESTAMP,
  },
};

export const SIGNED_MODULE_CONTENT = 'module.exports = { version: "2.0.0" };';

export const SIGNED_MANIFEST_META: ProModuleMeta = {
  version: '2.0.0',
  minCliVersion: '1.0.0',
  sha256: '374380122c448bd9d922d05d12c332793839a0a3c6958d11e898163e35677b27',
  size: 38,
  updatedAt: '2023-11-14T22:13:20.000Z',
  features: ['clone-with-variables', 'hooks'],
};

export const SIGNED_MANIFEST_FIXTURE: SignedProModuleMeta = {
  data: SIGNED_MANIFEST_META,
  signature: {
    payload:
      'eyJkYXRhIjp7InZlcnNpb24iOiIyLjAuMCIsIm1pbkNsaVZlcnNpb24iOiIxLjAuMCIsInNoYTI1NiI6IjM3NDM4MDEyMmM0NDhiZDlkOTIyZDA1ZDEyYzMzMjc5MzgzOWEwYTNjNjk1OGQxMWU4OTgxNjNlMzU2NzdiMjciLCJzaXplIjozOCwidXBkYXRlZEF0IjoiMjAyMy0xMS0xNFQyMjoxMzoyMC4wMDBaIiwiZmVhdHVyZXMiOlsiY2xvbmUtd2l0aC12YXJpYWJsZXMiLCJob29rcyJdfSwidGltZXN0YW1wIjoxNzAwMDAwMDAwMDAwLCJqdGkiOiJwcm8tbG9hZGVyLXRlc3QtanRpIn0=',
    sign:
      'H5M6LpKNE9nOY8X796rqclV4wX/YJc68785YObqHmUl/YwKCYMC+8NRozDrR6Sa9VVeFAAG5Rn57wKpmkXzt8Moxc+BLfXQgjiUhT/LNv610giK6JrmcUZ08xG2si6pnQ9j039W6U1cYSmESrFL98W2wx69yvJftonIYXMGReT/SZNiTDNPfqJyfBkEtBW6LYCFetKtgPQomkUJszOQlbhMcewupltJ83M5PdnGWib9YP3vv2O01V4AilD/r2oeCYI2zUUL2EWr+6UGuzhMu1EUE9UMaryE6eRrDMTYs4t/2skpkZlLbDVQdxiG8pAoD8GJC9Hv4W3FPZeqTDAQSmg==',
    algorithm: 'RS256',
    timestamp: STALE_LICENSE_TIMESTAMP,
  },
};
