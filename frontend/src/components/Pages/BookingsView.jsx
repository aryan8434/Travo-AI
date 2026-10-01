import React, { useState } from 'react';
import { BookmarkCheck, CheckCircle2, XCircle, Eye, Calendar, Users, MapPin, ArrowLeft, ShieldCheck, QrCode } from 'lucide-react';
import TicketModal from './TicketModal';
import InvoiceDownloadButton from '../Payment/InvoiceDownloadButton';

export default function BookingsView({ bookings, onBackToHome }) {
  const [activeTab, setActiveTab] = useState('SUCCESS'); // 'SUCCESS' | 'FAILED'
  const [selectedTicket, setSelectedTicket] = useState(null);

  const successfulBookings = bookings.filter((b) => b.status === 'CONFIRMED');
  const failedBookings = bookings.filter((b) => b.status === 'FAILED');

  const currentList = activeTab === 'SUCCESS' ? successfulBookings : failedBookings;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-[#0b0f17] text-slate-100 animate-fade-in">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <button
            onClick={onBackToHome}
            className="flex items-center gap-1.5 text-xs text-cyan-400 hover:underline mb-1 font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to AI Concierge
          </button>
          <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <BookmarkCheck className="w-6 h-6 text-emerald-400" /> My Bookings & Tickets
          </h2>
          <p className="text-xs text-slate-400">View payment receipts and supplier confirmation status for your trips</p>
        </div>

        {/* Successful vs Failed Tabs */}
        <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 self-start">
          <button
            onClick={() => setActiveTab('SUCCESS')}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'SUCCESS'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Paid Bookings ({successfulBookings.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('FAILED')}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'FAILED'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <XCircle className="w-4 h-4" />
            <span>Failed / Cancelled ({failedBookings.length})</span>
          </button>
        </div>
      </div>

      {/* Bookings List */}
      {currentList.length === 0 ? (
        <div className="glass-panel p-8 rounded-2xl text-center space-y-3 max-w-md mx-auto my-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
            <BookmarkCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Bookings Available</h3>
          <p className="text-xs text-slate-400">
            {activeTab === 'SUCCESS' ? 'You have no active confirmed bookings yet.' : 'No failed bookings logged.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentList.map((b) => (
            <div
              key={b.booking_id}
              className="glass-card rounded-2xl p-4 border border-slate-800 hover:border-cyan-500/30 transition-all space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase">
                        PNR: {b.pnr || 'TRV-894102'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {b.booking_id}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white leading-tight mt-0.5">
                      {b.item_name}
                    </h3>
                  </div>
                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                      b.status === 'CONFIRMED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {b.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{b.destination || 'India'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{b.guests || 1} Traveler(s)</span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 line-clamp-2">
                  {b.details || 'Confirmed Pass'}
                </p>
              </div>

              {/* Price & Action Buttons */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-base font-extrabold text-cyan-400">
                    ₹{Number(b.actual_price || 0).toLocaleString('en-IN')}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {b.charged_amount != null && Number(b.charged_amount) < Number(b.actual_price)
                      ? `Booking value · paid ₹${Number(b.charged_amount).toLocaleString('en-IN')}`
                      : 'Total Price'}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {b.status === 'CONFIRMED' && (
                    <button
                      onClick={() => setSelectedTicket(b)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1 transition-all"
                    >
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      <span>View Ticket</span>
                    </button>
                  )}
                  <InvoiceDownloadButton invoiceNo={b.invoice?.invoice_no} label="Invoice PDF" compact />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ticket Modal Popup */}
      {selectedTicket && (
        <TicketModal
          booking={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}
