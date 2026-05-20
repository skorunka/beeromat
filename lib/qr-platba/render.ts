import 'server-only';
import QRCode from 'qrcode';

// Render a SPAYD payment string as an inline SVG QR code. SVG (not
// PNG) scales crisply on Retina phone screens and is compact at the
// typical QR size. Error-correction level M balances density and
// scan reliability for a payment QR.
export async function renderQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  });
}
