import { TestBed } from '@angular/core/testing';
import Keycloak from 'keycloak-js';
import { AuthService } from './auth.service';
import { KEYCLOAK_CONFIG } from './config';

jest.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
jest.mock('@capacitor/app', () => ({
  App: { addListener: jest.fn(), getLaunchUrl: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@capacitor/browser', () => ({
  Browser: { addListener: jest.fn(), open: jest.fn(), close: jest.fn() },
}));
jest.mock('@aparajita/capacitor-secure-storage', () => ({
  SecureStorage: {
    get: jest.fn().mockResolvedValue({ token: 'old', refreshToken: 'revoked' }),
    set: jest.fn(),
    remove: jest.fn(),
  },
}));

describe('AuthService (native)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('initializes a fresh client when the saved session is rejected, so login still works', async () => {
    const init = jest
      .spyOn(Keycloak.prototype, 'init')
      .mockRejectedValueOnce(new Error('refresh token revoked'))
      .mockResolvedValue(false);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: KEYCLOAK_CONFIG,
          useValue: { enabled: true, url: 'https://idp.test', realm: 'r', clientId: 'c' },
        },
      ],
    });
    const service = TestBed.inject(AuthService);

    await expect(service.init()).resolves.toBe(false);

    expect(init).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenLastCalledWith(expect.not.objectContaining({ refreshToken: expect.anything() }));
    // The client login() uses must be the one that was just initialized
    const current = (service as unknown as { keycloak: Keycloak }).keycloak;
    expect(init.mock.contexts[1]).toBe(current);
  });
});
