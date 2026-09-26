/**
 * SMS Provider Interface & Implementations for MED-GUARD.
 * Abstracts out the SMS sending logic so hospital/government SMS gateways
 * (Twilio, Gupshup, CDAC NIC Gateway, etc.) can be plugged in seamlessly.
 */

class SmsProvider {
  /**
   * Send an SMS to a phone number.
   * @param {Object} params
   * @param {string} params.to - Recipient phone number
   * @param {string} params.body - Message body
   * @param {string} params.encounterId - Encounter ID for tracking
   * @returns {Promise<{ success: boolean, providerMessageId: string, error?: string }>}
   */
  async sendSms({ to, body, encounterId }) {
    throw new Error('SmsProvider.sendSms must be implemented by subclass');
  }
}

class SimulatorSmsProvider extends SmsProvider {
  async sendSms({ to, body, encounterId }) {
    const providerMessageId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    console.log(`[SMS Simulator] Outbound to ${to}: "${body}" (Encounter: ${encounterId})`);
    return {
      success: true,
      providerMessageId,
      simulated: true,
    };
  }
}

let currentProvider = new SimulatorSmsProvider();

function getSmsProvider() {
  return currentProvider;
}

function setSmsProvider(provider) {
  if (!(provider instanceof SmsProvider)) {
    throw new Error('Provider must extend SmsProvider');
  }
  currentProvider = provider;
}

module.exports = {
  SmsProvider,
  SimulatorSmsProvider,
  getSmsProvider,
  setSmsProvider,
};
