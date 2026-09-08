import React from 'react';
import { X, Printer, Compass, CheckCircle2, ShieldCheck, QrCode, Calendar, MapPin, Users, Hash } from 'lucide-react';
import InvoiceCard from '../Payment/InvoiceCard';

export default function TicketModal({ booking, onClose }) {
  if (!booking) return null;

  const nominal = Number(booking.nominal_amount ?? booking.actual_price ?? 0);
  const charged = Number(booking.charged_amount ?? 0);
  const paidViaWallet = booking.paid_via_wallet;

  const handlePrint = () => {
    window.print();
  };

  const isConfirmed = booking.status === 'CONFIRMED';
  const qrUrl = booking.qr_code_url || `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${booking.booking_id}-${booking.pnr || 'TRV'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg glass-panel bg-[#0f172a] rounded-3xl border border-cyan-500/30 overflow-hidden shadow-2xl space-y-0 text-slate-100">
        
        {/* Top Branding Banner */}
        <div className="bg-gradient-to-r from-cyan-950 via-slate-900 to-blue-950 p-5 border-b border-cyan-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-1.5">
                Travo<span className="gradient-text">AI</span> Booking Receipt
              </h2>
              <span className="text-[10px] text-cyan-400 font-mono">Supplier confirmation pending</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ticket Content */}
        <div className="p-6 space-y-5">
          {/* Status & PNR Header */}
          <div className="flex items-center justify-between bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-mono block">PNR NUMBER</span>
              <span className="text-base font-extrabold text-cyan-400 font-mono tracking-wider">
                {booking.pnr || 'TRV-894102'}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">TICKET NO.</span>
              <span className="text-xs font-bold text-slate-200 font-mono">
                {booking.ticket_number || 'TCK-7749102'}
              </span>
            </div>

            <span
              className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full ${
                isConfirmed
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              {booking.status}
            </span>
          </div>

          {/* Booking Info Card */}
          <div className="space-y-3">
            <h3 className="text-lg font-extrabold text-white leading-tight">
              {booking.item_name}
            </h3>

            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2 text-slate-300">
                <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Destination</span>
                  <span className="font-semibold">{booking.destination || 'India'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-300">
                <Users className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Travelers</span>
                  <span className="font-semibold">{booking.guests || 1} Person(s)</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-300">
                <Calendar className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Booking Date</span>
                  <span className="font-semibold">
                    {new Date(booking.booking_date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-300">
                <Hash className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 block">Booking ID</span>
                  <span className="font-mono font-semibold text-slate-200">{booking.booking_id}</span>
                </div>
              </div>
            </div>
          </div>

          {/* QR Code & Price Section */}
          <div className="flex items-center justify-between bg-slate-900/80 p-4 rounded-2xl border border-cyan-500/20">
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Invoice Total</span>
              <div className="text-xl font-extrabold text-cyan-400">
                ₹{nominal.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-slate-400 block">
                {paidViaWallet
                  ? 'Paid in full from TravoAI Wallet'
                  : `Charged via Razorpay: ₹${charged.toLocaleString('en-IN')}`}
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> {paidViaWallet ? 'Wallet Settled' : 'Razorpay Verified'}
              </span>
            </div>

            {isConfirmed && booking.supplier_status === "confirmed" && (
              <div className="bg-white p-2 rounded-xl shadow-md flex flex-col items-center">
                <img
                  src={qrUrl}
                  alt="Ticket QR Code"
                  className="w-24 h-24 object-contain"
                />
                <span className="text-[9px] text-slate-700 font-mono font-bold mt-1">SCAN TICKET</span>
              </div>
            )}
          </div>

          {booking.invoice && <InvoiceCard invoice={booking.invoice} />}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">Your travel ticket will come from the supplier.</span>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Download PDF</span>
          </button>
        </div>

      </div>
    </div>
  );
}
