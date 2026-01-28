// Test direct du service QR
const qrCodeService = require('./src/core/qrcode/qrcode.service');

async function testQRService() {
  try {
    console.log('🔍 Test du service QR...');
    
    const qrData = {
      id: 'ticket_abc123',
      eventId: null,
      code: 'TICKET_123456789',
      type: 'TICKET'
    };
    
    const qrOptions = {
      format: 'base64',
      size: 'medium',
      includeLogo: false,
      errorCorrection: 'M'
    };
    
    const result = await qrCodeService.generateTicketQRCode(qrData, qrOptions);
    console.log('✅ Service QR fonctionne:', result);
    
  } catch (error) {
    console.error('❌ Erreur service QR:', error.message);
    console.error('Stack:', error.stack);
  }
}

testQRService();
