const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const logger = require('../config/logger');

/**
 * PDF generation via Puppeteer (invoices + restaurant statements).
 * The browser instance is launched lazily and reused. Falls back to
 * writing raw HTML when Chromium cannot start (e.g. sandbox-less CI).
 */

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      // puppeteer is an optional heavy dep; require lazily
      const puppeteer = require('puppeteer');
      return puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    })().catch((e) => {
      logger.warn(`Puppeteer unavailable (${e.message}) — PDFs degrade to HTML`);
      return null;
    });
  }
  return browserPromise;
}

async function htmlToPdf(html, outPath) {
  const browser = await getBrowser();
  if (!browser) {
    fs.writeFileSync(outPath.replace(/\.pdf$/, '.html'), html);
    return outPath.replace(/\.pdf$/, '.html');
  }
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({ path: outPath, format: 'A4', printBackground: true });
  await page.close();
  return outPath;
}

const invoiceLayout = (title, rows, meta) => `
<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;color:#222;padding:40px}
  h1{color:#e5533d;margin:0 0 4px} .muted{color:#888;font-size:12px}
  table{width:100%;border-collapse:collapse;margin-top:24px}
  th,td{padding:8px 6px;border-bottom:1px solid #eee;text-align:left;font-size:13px}
  th{background:#fafafa} .tot td{font-weight:bold;border-top:2px solid #333}
  .brand{display:flex;justify-content:space-between;align-items:flex-start}
</style></head><body>
  <div class="brand"><div><h1>QuickBite</h1><div class="muted">${meta.company || 'QuickBite Inc.'}</div></div>
  <div style="text-align:right"><h2>${title}</h2><div class="muted">${meta.number}</div>
  <div class="muted">${meta.date}</div></div></div>
  <p style="margin-top:24px"><b>Bill to:</b> ${meta.customer}<br/><span class="muted">${meta.address || ''}</span></p>
  <table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td>${r.name}</td><td>${r.qty}</td><td>${r.unit}</td><td>${r.amount}</td></tr>`).join('')}
  ${meta.extraRows || ''}
  <tr class="tot"><td colspan="3">Total</td><td>${meta.total}</td></tr>
  </tbody></table>
  <p class="muted" style="margin-top:32px">Thank you for ordering! Generated automatically by QuickBite.</p>
</body></html>`;

function ensurePdfDir() {
  const dir = path.join(process.cwd(), env.UPLOAD_DIR, 'pdf');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Order invoice PDF — returns absolute file path under /uploads/pdf. */
async function generateOrderInvoicePdf(order) {
  const rows = order.items.map((i) => ({
    name: `${i.nameSnapshot}${i.specialInstructions ? ` (${i.specialInstructions})` : ''}`,
    qty: i.quantity, unit: Number(i.priceSnapshot).toFixed(2),
    amount: Number(i.lineTotal).toFixed(2),
  }));
  const extra = [
    { name: 'Delivery fee', qty: 1, unit: Number(order.deliveryFee).toFixed(2), amount: Number(order.deliveryFee).toFixed(2) },
    { name: 'Service fee', qty: 1, unit: Number(order.serviceFee).toFixed(2), amount: Number(order.serviceFee).toFixed(2) },
    ...(Number(order.discountTotal) > 0 ? [{ name: `Discount${order.promoCode ? ` (${order.promoCode.code})` : ''}`, qty: 1, unit: `-${Number(order.discountTotal).toFixed(2)}`, amount: `-${Number(order.discountTotal).toFixed(2)}` }] : []),
  ];
  const html = invoiceLayout('INVOICE', [...rows, ...extra], {
    company: order.branch?.restaurant?.name || 'Restaurant partner',
    number: order.orderNumber,
    date: new Date(order.createdAt).toISOString().slice(0, 10),
    customer: order.customer?.fullName || 'Customer',
    address: [order.address?.line1, order.address?.city, order.address?.country].filter(Boolean).join(', '),
    total: Number(order.total).toFixed(2),
  });
  return htmlToPdf(html, path.join(ensurePdfDir(), `invoice-${order.orderNumber}.pdf`));
}

/** Restaurant monthly earnings statement PDF. */
async function generateRestaurantStatementPdf(restaurant, period, summary) {
  const rows = [
    { name: `Orders (${summary.count})`, qty: 1, unit: summary.gross.toFixed(2), amount: summary.gross.toFixed(2) },
    { name: `Platform commission (${summary.commissionPercent}%)`, qty: 1, unit: `-${summary.commission.toFixed(2)}`, amount: `-${summary.commission.toFixed(2)}` },
    { name: 'Net payable', qty: 1, unit: summary.net.toFixed(2), amount: summary.net.toFixed(2) },
  ];
  const html = invoiceLayout('EARNINGS STATEMENT', rows, {
    company: restaurant.name,
    number: `${restaurant.slug}-${period}`,
    date: new Date().toISOString().slice(0, 10),
    customer: restaurant.owner?.fullName || 'Restaurant partner',
    total: summary.net.toFixed(2),
  });
  return htmlToPdf(html, path.join(ensurePdfDir(), `statement-${restaurant.slug}-${period}.pdf`));
}

module.exports = { generateOrderInvoicePdf, generateRestaurantStatementPdf, htmlToPdf };
