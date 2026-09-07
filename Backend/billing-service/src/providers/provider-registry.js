'use strict';

const { BillingError } = require('../domain/billing');

class ProviderRegistry {
  constructor({ providers = [], defaultProvider }) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
    this.defaultProvider = defaultProvider;
  }

  get(id = this.defaultProvider) {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new BillingError('No hay un proveedor de cobro disponible', {
        code: 'provider_unavailable',
        status: 503,
      });
    }
    return provider;
  }

  describe() {
    return [...this.providers.keys()].map((id) => ({ id, active: id === this.defaultProvider }));
  }
}

module.exports = { ProviderRegistry };
