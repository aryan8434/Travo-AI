import axios from 'axios';

// The server renders the PDF from the stored receipt; the request carries the
// signed-in user's token, so it is fetched as a blob rather than linked.
export async function downloadInvoice(invoiceNo) {
  const { data } = await axios.get('/user/invoice.pdf', { params: { no: invoiceNo }, responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const link = Object.assign(document.createElement('a'), { href: url, download: `TravoAI-${invoiceNo.replace('/', '-')}.pdf` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
