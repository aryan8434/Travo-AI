import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, User, Sparkles, BookmarkCheck, Eye } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import BookingCard from './BookingCard';
import TicketModal from '../Pages/TicketModal';
import InvoiceCard from '../Payment/InvoiceCard';
import InvoiceDownloadButton from '../Payment/InvoiceDownloadButton';
import { useMotion, staggerParent } from '../../lib/motion';

export default function MessageItem({ message, onBookingComplete, onBookingError, onGoToBookings, currentUser, onOpenAuthModal }) {
  const [showTicketModal, setShowTicketModal] = useState(false);
  const isUser = message.sender === 'user';
  const { fadeInUp } = useMotion();

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="show"
      exit="exit"
      layout
      className={`flex gap-3 my-4 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {/* Bot Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-cyan-500/20">
          <Bot className="w-4 h-4" />
        </div>
      )}

      <div className={`max-w-[85%] md:max-w-[75%] space-y-2`}>
        {/* Message Bubble */}
        <div
          className={`p-3.5 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-tr-none shadow-md shadow-cyan-600/15'
              : 'glass-panel text-slate-200 rounded-tl-none border border-slate-800'
          }`}
        >
          {message.text ? (
            <ReactMarkdown className="prose prose-invert prose-sm max-w-none">
              {message.text}
            </ReactMarkdown>
          ) : (
            <span>{message.content}</span>
          )}

          {/* Action Buttons for Confirmed Bookings in AI Chat */}
          {!isUser && message.booking && (
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
              <button
                onClick={onGoToBookings}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <BookmarkCheck className="w-4 h-4 text-cyan-400" />
                <span>Go to My Bookings</span>
              </button>

              <button
                onClick={() => setShowTicketModal(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all"
              >
                <Eye className="w-4 h-4" />
                <span>View Ticket &amp; Invoice</span>
              </button>

              <InvoiceDownloadButton invoiceNo={(message.invoice || message.booking?.invoice)?.invoice_no} />
            </div>
          )}

          {message.sources?.length > 0 && <ol className="list-decimal pl-4 text-xs text-cyan-300 mt-3">{message.sources.map(source => <li key={source.chunk_id}>{source.title} — {source.section}</li>)}</ol>}
          {/* Server-issued payment receipt */}
          {!isUser && (message.invoice || message.booking?.invoice) && (
            <div className="mt-4">
              <InvoiceCard invoice={message.invoice || message.booking.invoice} />
            </div>
          )}
        </div>

        {/* Results Cards (Buses, Flights, Hotels, RAG Packages) */}
        {!isUser && message.results && message.results.length > 0 && (
          <div className="space-y-2 mt-3">
            <div className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> Found {message.results.length} Available Option(s):
            </div>

            <motion.div className="space-y-2" variants={staggerParent} initial="hidden" animate="show">
              {message.results.map((item, idx) => (
                <BookingCard
                  key={item.id || item.package_id || item.bus_id || item.flight_id || item.hotel_id || idx}
                  item={item}
                  cardType={message.type}
                  onBookingComplete={onBookingComplete}
                  onBookingError={onBookingError}
                  currentUser={currentUser}
                  onOpenAuthModal={onOpenAuthModal}
                />
              ))}
            </motion.div>
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
          <User className="w-4 h-4" />
        </div>
      )}

      {/* Interactive Ticket Modal Popup */}
      {showTicketModal && message.booking && (
        <TicketModal
          booking={message.booking}
          onClose={() => setShowTicketModal(false)}
        />
      )}
    </motion.div>
  );
}
