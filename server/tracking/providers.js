import crypto from 'node:crypto';

const carrierCodes = {
  Maersk: 'MAEU', MSC: 'MSCU', 'Hapag-Lloyd': 'HLCU', 'CMA CGM': 'CMDU',
  ONE: 'ONEY', Evergreen: 'EGLV', COSCO: 'COSU', OOCL: 'OOLU'
};

const mockMilestones = [
  { id: 'gate-out-origin', code: 'GATE_OUT', description: 'Gated out', location: 'MUNICH', offsetDays: -14, actual: true, transportMode: 'TRUCK' },
  { id: 'gate-in-port', code: 'GATE_IN', description: 'Gated in', location: 'HAMBURG', offsetDays: -9, actual: true, transportMode: 'TRUCK' },
  { id: 'loaded', code: 'LOAD', description: 'Loaded on vessel', location: 'HAMBURG', offsetDays: -4, actual: true, transportMode: 'VESSEL' },
  { id: 'departed', code: 'DEPARTURE', description: 'Vessel departed', location: 'HAMBURG', offsetDays: -4, actual: true, transportMode: 'VESSEL' },
  { id: 'arrived', code: 'ARRIVAL', description: 'Vessel arrived', location: 'COLOMBO', offsetDays: 25, actual: false, transportMode: 'VESSEL' },
  { id: 'discharged', code: 'DISCHARGE', description: 'Discharged from vessel', location: 'COLOMBO', offsetDays: 26, actual: false, transportMode: 'VESSEL' },
  { id: 'gate-out-destination', code: 'GATE_OUT', description: 'Gated out for delivery', location: 'COLOMBO', offsetDays: 27, actual: false, transportMode: 'TRUCK' },
  { id: 'delivered', code: 'DELIVERY', description: 'Delivered to consignee', location: 'COLOMBO', offsetDays: 30, actual: false, transportMode: 'TRUCK' }
];

function eventTime(offsetDays) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offsetDays);
  value.setUTCMinutes(0, 0, 0);
  return value.toISOString();
}

function mockEvent(referenceId, milestone) {
  return {
    providerEventId: `${referenceId}:${milestone.id}`,
    eventCode: milestone.code,
    description: milestone.description,
    eventTime: eventTime(milestone.offsetDays),
    isEstimated: !milestone.actual,
    location: milestone.location,
    vessel: milestone.transportMode === 'VESSEL' ? 'DEMO OCEAN STAR' : '',
    voyage: milestone.transportMode === 'VESSEL' ? '0632E' : '',
    transportMode: milestone.transportMode
  };
}

class MockTrackingProvider {
  name = 'mock';

  async subscribe({ containerNumber, carrier }) {
    const referenceId = `mock_${crypto.randomUUID()}`;
    return {
      referenceId,
      carrierCode: carrierCodes[carrier] || 'MOCK',
      events: mockMilestones.map(milestone => mockEvent(referenceId, milestone)),
      metadata: { containerNumber, carrier, simulated: true }
    };
  }

  nextEvent(referenceId, existingEvents) {
    const next = mockMilestones.find(milestone => !milestone.actual && existingEvents.some(event => event.providerEventId === `${referenceId}:${milestone.id}` && event.isEstimated));
    if (!next) return null;
    return { ...mockEvent(referenceId, next), eventTime: new Date().toISOString(), isEstimated: false };
  }
}

export function trackingProviderName() {
  return String(process.env.TRACKING_PROVIDER || 'manual').trim().toLowerCase();
}

export function createTrackingProvider(name = trackingProviderName()) {
  if (name === 'mock') return new MockTrackingProvider();
  throw new Error(`Tracking provider "${name}" is not installed. Use TRACKING_PROVIDER=mock until a production adapter is configured.`);
}

export function normalizeTrackingStatus(event) {
  const code = String(event.eventCode || '').toUpperCase();
  if (['DELIVERY', 'DELIVERED', 'GATE_IN_DESTINATION'].includes(code)) return 'DELIVERED';
  if (['DELAY', 'ROLLED', 'VESSEL_DELAY'].includes(code)) return 'DELAYED';
  if (['ARRIVAL', 'DISCHARGE'].includes(code)) return 'ARRIVING_SOON';
  if (['GATE_OUT', 'GATE_IN', 'LOAD', 'DEPARTURE', 'TRANSSHIPMENT'].includes(code)) return 'IN_TRANSIT';
  return 'NOT_UPDATED';
}

export function carrierCodeFor(carrier) {
  return carrierCodes[carrier] || '';
}
