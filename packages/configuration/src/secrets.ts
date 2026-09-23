export interface SecretProvider {
  getSecret(reference: string): Promise<string>;
}

export class EnvironmentSecretProvider implements SecretProvider {
  getSecret(reference: string): Promise<string> {
    const value = process.env[reference];
    if (!value)
      return Promise.reject(new Error(`Secret reference is not configured: ${reference}`));
    return Promise.resolve(value);
  }
}

export interface ExternalSecretProvider extends SecretProvider {
  readonly providerType: 'external';
}
