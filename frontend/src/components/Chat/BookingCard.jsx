import React from 'react';
import { motion } from 'framer-motion';
import { Star, Calendar, Users, MapPin, Bus, Plane, Hotel, Sparkles, CheckCircle2, ArrowRight, ShieldCheck, Lock } from 'lucide-react';
import { initializePayment } from '../../utils/razorpay';
import { fadeInUp } from '../../lib/motion';
import { chargeFor, usePaymentConfig } from '../../utils/paymentConfig';

const cardAnim = {
  variants: fadeInUp,
  initial: 'hidden',
  animate: 'show',
  whileHover: { y: -4, transition: { duration: 0.18 } },
  whileTap: { scale: 0.99 },
};

function BookingCard({ item, cardType, onBookingComplete, onBookingError, currentUser, onOpenAuthModal }) {
  const paymentConfig = usePaymentConfig();
  if (!item) return null;
  // Shows 'pay ₹1' on the button when the server confirms bookings for less than their value.
  const payLabel = (price) => { const charge = chargeFor(Number(price), paymentConfig); return charge < Number(price) ? ' · pay ₹' + charge : ''; };

  const isPackage = cardType === 'package' || item.package_id || item.days;
  const isBus = cardType === 'bus' || item.bus_id || item.operator;
  const isFlight = cardType === 'flight' || item.flight_id || item.airline;
  const isHotel = cardType === 'hotel' || item.hotel_id || item.price_per_night_inr;

  const actualPriceInRupees = Number(item.price_inr || item.price || item.price_per_night_inr || 1000);

  const checkout = (selection) => {
    // ENFORCE LOGIN GUARD: No booking allowed unless user is signed in!
    if (!currentUser) {
      if (onOpenAuthModal) onOpenAuthModal();
      return;
    }

    initializePayment(
      selection,
      (booking) => {
        if (onBookingComplete) onBookingComplete(booking);
      },
      (error) => {
        if (onBookingError) onBookingError(error);
      }
    );
  };
  const handleBookNow = () => checkout(item);

  /* =========================================================
     1. HOLIDAY PACKAGE CARD (RAG VECTOR RESULT)
     ========================================================= */
  if (isPackage) {
    return (
      <motion.div {...cardAnim} className="glass-card rounded-2xl overflow-hidden border border-cyan-500/20 hover:border-cyan-500/40 transition-colors duration-300 shadow-xl shadow-cyan-950/20 my-3 group">
        <div className="bg-gradient-to-r from-cyan-950/60 via-slate-900 to-blue-950/60 p-4 border-b border-cyan-500/10 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" /> RAG Recommended
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                🎯 {item.match_score || 96}% Match
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-cyan-400" /> {item.destination}, {item.state || 'India'}
              </span>
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
              {item.title}
            </h3>
            {item.match_reason && (
              <p className="text-[11px] text-emerald-400 font-medium mt-1">
                💡 {item.match_reason}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold text-cyan-400">
              ₹{actualPriceInRupees.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-slate-400">per package</span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 text-slate-300">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span>{item.days || 3} Days / {item.nights || 2} Nights</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>{item.capacity_people || 2} Guests</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>{item.rating || 4.8}★ Rating</span>
            </div>
          </div>

          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
            {item.description}
          </p>

          {item.included_services && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {item.included_services.meals && (
                <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded-md border border-slate-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {item.included_services.meals}
                </span>
              )}
              {item.included_services.transport && (
                <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded-md border border-slate-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {item.included_services.transport}
                </span>
              )}
            </div>
          )}

          <div className="pt-2 flex items-center justify-between">
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" /> Razorpay Standard Checkout
            </span>
            <button
              onClick={handleBookNow}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs rounded-xl shadow-md shadow-cyan-500/20 flex items-center gap-1.5 transition-all duration-200"
            >
              <span>Book Package{payLabel(item.price_inr)}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  /* =========================================================
     2. BUS CARD
     ========================================================= */
  if (isBus) {
    return (
      <motion.div {...cardAnim} className="glass-card rounded-xl p-3 border border-slate-800 hover:border-cyan-500/30 transition-colors my-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Bus className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white">{item.operator}</h4>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                {item.bus_type || 'AC Sleeper'}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              <span>{item.from || item.from_city} ➔ {item.to || item.to_city}</span>
              <span className="ml-2 text-cyan-400 font-mono">🕒 {item.time || item.departure_time}</span>
            </div>
            {item.distance_km && (
              <div className="text-[10px] text-slate-500 mt-0.5">
                ~{item.distance_km.toLocaleString('en-IN')} km by road · ₹{item.rate_per_km}/km
                {item.duration ? ` · ~${item.duration}` : ''}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-extrabold text-cyan-400">
              ₹{actualPriceInRupees.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-slate-400">per seat</span>
          </div>
          <button
            onClick={handleBookNow}
            disabled={item.bookable === false}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition-all"
          >
            {item.bookable === false ? 'Estimate · booking unavailable' : 'Book Seat'}
          </button>
        </div>
      </motion.div>
    );
  }

  /* =========================================================
     3. FLIGHT CARD
     ========================================================= */
  if (isFlight) {
    return (
      <motion.div {...cardAnim} className="glass-card rounded-xl p-3 border border-slate-800 hover:border-sky-500/30 transition-colors my-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Plane className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white">{item.airline}</h4>
              <span className="text-[10px] bg-slate-800 text-sky-300 px-1.5 py-0.5 rounded font-mono">
                {item.flight_number || item.id}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              <span>
                {item.from || item.from_airport}
                {item.fromIata ? ` (${item.fromIata})` : ''} ➔ {item.to || item.to_airport}
                {item.toIata ? ` (${item.toIata})` : ''}
              </span>
              <span className="ml-2 text-cyan-400 font-mono">🛫 {item.time || item.departure_time}</span>
            </div>
            {item.distance_km && (
              <div className="text-[10px] text-slate-500 mt-0.5">
                {item.distance_km.toLocaleString('en-IN')} km · ₹{item.rate_per_km}/km
                {item.duration ? ` · ${item.duration}` : ''}
                {item.stops === 0 ? ' · non-stop' : item.stops ? ` · ${item.stops} stop` : ''}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-extrabold text-sky-400">
              ₹{actualPriceInRupees.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-slate-400">economy</span>
          </div>
          <button
            onClick={handleBookNow}
            disabled={item.bookable === false}
            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs rounded-lg transition-all"
          >
            {item.bookable === false ? 'Estimate · booking unavailable' : 'Book Flight'}
          </button>
        </div>
      </motion.div>
    );
  }

  /* =========================================================
     4a. CATALOGUE STAY — the hotel included in a package; it has no
         standalone nightly rate, so it shows and books the package.
     ========================================================= */
  if (isHotel && item.package) {
    const pkg = item.package;
    return (
      <motion.div {...cardAnim} className="glass-card rounded-xl p-3 border border-slate-800 hover:border-amber-500/30 transition-colors my-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Hotel className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-white">{item.name}</h4>
                {item.rating && (
                  <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5">★ {item.rating}</span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                📍 {item.city}{item.state && item.state !== item.city ? `, ${item.state}` : ''}
                {item.distance_km ? ` · ~${item.distance_km.toLocaleString('en-IN')} km away` : ''}
              </div>
              {item.hotel_tier && <div className="text-[11px] text-slate-500 mt-0.5">{item.hotel_tier}</div>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-extrabold text-amber-400">₹{Number(pkg.price_inr).toLocaleString('en-IN')}</div>
            <span className="text-[10px] text-slate-400">package · {pkg.nights} nights</span>
          </div>
        </div>

        {item.about && <p className="text-xs text-slate-300 mt-2 line-clamp-2 leading-relaxed">{item.about}</p>}

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400 min-w-0 truncate">
            Included in {pkg.title} · {pkg.capacity_people || 2} guests
          </span>
          <button
            onClick={() => checkout(pkg)}
            className="px-3 py-1.5 shrink-0 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-lg transition-all"
          >
            Book package{payLabel(pkg.price_inr)}
          </button>
        </div>
      </motion.div>
    );
  }

  /* =========================================================
     4b. HOTEL CARD (live supplier rate)
     ========================================================= */
  if (isHotel) {
    return (
      <motion.div {...cardAnim} className="glass-card rounded-xl p-3 border border-slate-800 hover:border-amber-500/30 transition-colors my-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Hotel className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white">{item.name}</h4>
              <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5">
                ★ {item.rating || item.user_rating || 4.2}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              <span>📍 {item.city || item.address || 'Central Location'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-extrabold text-amber-400">
              ₹{actualPriceInRupees.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-slate-400">/ night</span>
          </div>
          <button
            onClick={handleBookNow}
            disabled={item.bookable === false}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-lg transition-all"
          >
            {item.bookable === false ? 'Rate only · booking unavailable' : 'Book Room'}
          </button>
        </div>
      </motion.div>
    );
  }

  return null;
}

export default React.memo(BookingCard);
