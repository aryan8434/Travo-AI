import React, { useState, useEffect, lazy, Suspense } from 'react';
import axios from 'axios';
import { recoverPendingPayment } from './utils/razorpay';
import Header from './components/Header';
import ChatBox from './components/Chat/ChatBox';
import RightSidebar from './components/Sidebar/RightSidebar';
import LeftDrawer from './components/Sidebar/LeftDrawer';
import AuthModal from './components/Auth/AuthModal';
import PaymentBanner from './components/Payment/PaymentBanner';
import { SHOWN_RESULTS, asksForMore } from './utils/results';

// Pages — lazy so each is a separate chunk, loaded on first navigation
const FlightsView = lazy(() => import('./components/Pages/FlightsView'));
const PackagesView = lazy(() => import('./components/Pages/PackagesView'));
const TransactionsView = lazy(() => import('./components/Pages/TransactionsView'));
const BookingsView = lazy(() => import('./components/Pages/BookingsView'));
const SupportView = lazy(() => import('./components/Pages/SupportView'));
const AboutView = lazy(() => import('./components/Pages/AboutView'));
const AdminView = lazy(() => import('./components/Pages/AdminView'));
const RagExplorerView = lazy(() => import('./components/Pages/RagExplorerView'));
const WalletView = lazy(() => import('./components/Pages/WalletView'));
const RagArchitectureModal = lazy(() => import('./components/Pages/RagArchitectureModal'));

// Storage
import { getStoredTransactions, getStoredBookings, getWalletBalance, refreshAccount, clearAccount } from './utils/storage';

const ViewFallback = () => (
  <div className="flex-1 flex items-center justify-center text-xs text-slate-500 animate-pulse">
    Loading…
  </div>
);

export default function App() {
  const [messages, setMessages] = useState([{ sender: 'bot', text: 'Welcome to **TravoAI**. Find holiday packages, compare travel tiers, and estimate flights across India. Try **Goa packages under ₹50,000** or choose a destination from the menu.' }]);
  const [loading, setLoading] = useState(false);
  const [activeCity, setActiveCity] = useState('Delhi');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sessionId] = useState(() => crypto.randomUUID());

  // User Auth & Modal state
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('travoai_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isRagModalOpen, setIsRagModalOpen] = useState(false);

  // Navigation & Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentView, setCurrentView] = useState('home');

  // Wallet state
  const [walletBalance, setWalletBalance] = useState(() => getWalletBalance());

  // Data lists
  const [transactions, setTransactions] = useState([]);
  const [bookings, setBookings] = useState([]);

  // A saved sign-in expires after a day, and a new server signing secret
  // invalidates it early. Any 401 on a signed-in request signs the visitor out
  // and says so, instead of leaving every call failing behind a stale token.
  useEffect(() => {
    const id = axios.interceptors.response.use(undefined, (error) => {
      const headers = error.config?.headers;
      const sentToken = headers?.get?.('Authorization') ?? headers?.Authorization;
      if (error.response?.status === 401 && sentToken && sentToken === axios.defaults.headers.common.Authorization) {
        clearAccount(); setWalletBalance(0); setBookings([]); setTransactions([]);
        setCurrentUser(null);
        localStorage.removeItem('travoai_user');
        delete axios.defaults.headers.common.Authorization;
        setMessages((prev) => [...prev, { sender: 'bot', text: '🔒 **Your sign-in expired**, so you have been signed out. Sign in again to book or see your bookings; chat keeps working as a guest.' }]);
      }
      return Promise.reject(error);
    });
    return () => axios.interceptors.response.eject(id);
  }, []);

  // Refresh the authenticated server account whenever navigation changes
  useEffect(() => {
    let active = true;
    refreshAccount().then(() => {
      if (!active) return;
      setTransactions(getStoredTransactions()); setBookings(getStoredBookings()); setWalletBalance(getWalletBalance());
    }).catch(() => {});
    return () => { active = false; };
  }, [currentView, isDrawerOpen, currentUser]);

  // Restore the auth header from a persisted session on first mount.
  useEffect(() => {
    if (currentUser?.token && !axios.defaults.headers.common.Authorization) {
      axios.defaults.headers.common.Authorization = `Bearer ${currentUser.token}`;
    }
  }, [currentUser?.token]);

  // Account-scoped history; discard responses after logout or account switches.
  useEffect(() => {
    if (!currentUser?.token) return;
    let active = true;
    const controller = new AbortController();
    axios.get('/api/chat/user-history', { signal: controller.signal }).then(({ data }) => {
      if (active && data.messages?.length) setMessages(data.messages);
    }).catch(() => {});
    recoverPendingPayment().then(data => {
      if (active && data?.success) {
        setWalletBalance(data.wallet);
        setMessages(prev => [...prev, { sender: 'bot', text: 'Your pending payment was verified. The receipt is available in your account.', booking: data.booking, invoice: data.invoice }]);
      }
    }).catch(() => {});
    return () => { active = false; controller.abort(); };
  }, [currentUser]);

  const handleLoginSuccess = (userObj) => {
    setCurrentUser(userObj);
    localStorage.setItem('travoai_user', JSON.stringify(userObj));
    if (userObj.token) {
      axios.defaults.headers.common.Authorization = `Bearer ${userObj.token}`;
    }
    if (userObj.walletBalance != null) {
      setWalletBalance(userObj.walletBalance);
    }

  };

  const handleLogout = () => {
    clearAccount(); setWalletBalance(0); setBookings([]); setTransactions([]); setMessages([]);
    sessionStorage.removeItem('travo_pending_payment');
    setCurrentUser(null);
    localStorage.removeItem('travoai_user');
    delete axios.defaults.headers.common.Authorization;
  };

  function handleBookingComplete(booking) {
    setWalletBalance(getWalletBalance());

    const isWallet = booking.paid_via_wallet;
    const nominal = Number(booking.nominal_amount ?? booking.actual_price);
    const charged = Number(booking.charged_amount ?? nominal);
    const balance = Math.max(0, Math.round((nominal - charged) * 100) / 100);
    const inr = (n) => `₹${n.toLocaleString('en-IN')}`;
    const headerTitle = isWallet ? "🎉 **Payment Received — paid from TravoAI Wallet**" : "🎉 **Booking Confirmed**";
    const balanceLine = balance > 0 ? `\n* **Not collected online**: ${inr(balance)}` : '';
    const paymentLine = isWallet
      ? `* **Booking value**: ${inr(nominal)}\n* **Paid from Wallet**: ${inr(charged)}${balanceLine}\n* **Remaining Wallet Balance**: ${inr(Number(booking.remaining_wallet_balance || 0))}`
      : `* **Booking value**: ${inr(nominal)}\n* **Paid via Razorpay**: ${inr(charged)}${balanceLine}`;

    const invoiceLine = booking.invoice
      ? `\n* **Invoice No.**: \`${booking.invoice.invoice_no}\``
      : '';

    const botMsg = {
      sender: 'bot',
      text: `${headerTitle}\n\n* **Item**: ${booking.item_name}\n* **PNR Number**: \`${booking.pnr}\`\n* **Ticket Number**: \`${booking.ticket_number}\`\n* **Booking ID**: \`${booking.booking_id}\`\n* **Transaction ID**: \`${booking.txn_id || 'TXN-CONFIRMED'}\`${invoiceLine}\n${paymentLine}\n\nYour invoice is ready: download the PDF below, or any time from **My Bookings**. Supplier confirmation is pending.`,
      booking: booking,
      invoice: booking.invoice || null,
    };

    setMessages((prev) => [...prev, botMsg]);

    if (currentUser?.username) {
      axios.post('/api/chat/save-user-message', { message: botMsg }).catch(e => e);
    }
  };

  const handleBookingError = (err) => {
    const failedBooking = err?.booking;
    const reason = err?.message || 'Payment cancelled or failed';
    const txnId = failedBooking?.txn_id || `TXN-${Math.floor(100000 + Math.random() * 900000)}`;

    const botMsg = {
      sender: 'bot',
      text: `❌ **Booking Payment Failed / Cancelled**\n\n* **Item**: ${failedBooking?.item_name || 'Travel Booking'}\n* **Transaction ID**: \`${txnId}\`\n* **Status**: \`FAILED\`\n* **Reason**: *${reason}*\n\nYour payment attempt was logged under **Transaction History** in the top-left menu. No ticket pass was generated.`
    };

    setMessages((prev) => [...prev, botMsg]);

    if (currentUser?.username) {
      axios.post('/api/chat/save-user-message', { message: botMsg }).catch(e => e);
    }
  };

  const handleCategorySelect = async (category) => {
    setSelectedCategory(category);
    setCurrentView('home');
    if (category === 'all') return;

    setLoading(true);
    try {
      if (category === 'package') {
        const res = await axios.get('/api/packages');
        const pkgs = res.data?.packages || [];
        setMessages((prev) => [
          ...prev,
          {
            sender: 'user',
            text: '🌴 Show all RAG Holiday Packages (Vectra Vector DB Proof)'
          },
          {
            sender: 'bot',
            text: '⚡ **Vectra Vector DB Proof**: Here are the retrieved travel package vector embeddings stored in our local Vectra Vector Database:',
            type: 'package',
            results: pkgs
          }
        ]);
      }
    } catch (err) {
      console.error('Category query error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (userText) => {
    if (!userText.trim()) return;

    const userMsg = { sender: 'user', text: userText };
    setMessages((prev) => [...prev, userMsg]);

    // "show more" reveals what the last list held back: no new search or AI call.
    const lastList = [...messages].reverse().find((m) => m.sender === 'bot' && (m.results?.length || 0) > SHOWN_RESULTS && !m.moreShown);
    if (asksForMore(userText) && lastList) {
      const more = lastList.results.slice(SHOWN_RESULTS);
      setMessages((prev) => [
        ...prev.map((m) => (m === lastList ? { ...m, moreShown: true } : m)),
        { sender: 'bot', text: `Here are ${more.length} more option${more.length === 1 ? '' : 's'}:`, type: lastList.type, results: more },
      ]);
      return;
    }
    setLoading(true);

    if (currentUser?.username) {
      axios.post('/api/chat/save-user-message', { message: userMsg }).catch(e => e);
    }

    try {
      const ask = () => axios.post('/chat', { message: userText, sessionId, userCity: activeCity });
      let response;
      try {
        response = await ask();
      } catch (err) {
        // The interceptor has signed out the stale session; answer as a guest.
        if (err.response?.status !== 401) throw err;
        response = await ask();
      }

      const data = response.data;
      if (data.activeCity) {
        setActiveCity(data.activeCity);
      }

      const botMsg = {
        sender: 'bot',
        text: data.text || "Here are the options I found for you:",
        intent: data.intent,
        type: data.type,
        results: data.results || [],
        sources: data.sources || [],
        curated: data.curated === true
      };

      setMessages((prev) => [...prev, botMsg]);

      if (currentUser?.username) {
        axios.post('/api/chat/save-user-message', { message: botMsg }).catch(e => e);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const status = error.response?.status;

      // Prefer the server's own message; otherwise describe what actually failed.
      // (An exhausted AI quota never reaches here: chat falls back to keyword intent.)
      const text =
        error.response?.data?.text ||
        (status === 429
          ? "⏳ **Too many requests** in a short time. Please wait a minute and try again."
          : status === 401
            ? "🔒 Please sign in again, then retry."
            : status
              ? "⚠️ **Something went wrong on our side.** Please try again in a moment."
              : "📡 **Can't reach the TravoAI server.** Check your connection and try again.");

      setMessages((prev) => [...prev, { sender: 'bot', text }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0b0f17] text-slate-100 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Navbar */}
      <Header
        onToggleDrawer={() => setIsDrawerOpen(true)}
        activeCity={activeCity}
        selectedCategory={selectedCategory}
        setSelectedCategory={handleCategorySelect}
        walletBalance={walletBalance}
        onOpenWallet={() => setCurrentView('wallet')}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        onOpenRagModal={() => setIsRagModalOpen(true)}
      />
      <PaymentBanner />

      {/* Sliding YouTube-style Left Navigation Drawer */}
      <LeftDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        currentView={currentView}
        setCurrentView={setCurrentView}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* RAG Architecture Modal */}
      {isRagModalOpen && (
        <Suspense fallback={null}>
          <RagArchitectureModal isOpen={isRagModalOpen} onClose={() => setIsRagModalOpen(false)} />
        </Suspense>
      )}

      {/* Main Container Views */}
      <Suspense fallback={<ViewFallback />}>
      <div className="flex flex-1 overflow-hidden">
        {currentView === 'flights' && <FlightsView onBackToHome={() => setCurrentView('home')} />}
        {currentView === 'home' && (
          <>
            {/* Left / Center Chat Column */}
            <main className="flex-1 overflow-hidden">
              <ChatBox
                messages={messages}
                onSendMessage={handleSendMessage}
                loading={loading}
                onBookingComplete={handleBookingComplete}
                onBookingError={handleBookingError}
                onGoToBookings={() => setCurrentView('bookings')}
                currentUser={currentUser}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
              />
            </main>

            {/* Right Sidebar Widgets */}
            <RightSidebar
              activeCity={activeCity}
              onCityChange={setActiveCity}
            />
          </>
        )}

        {currentView === 'wallet' && (
          <WalletView
            onBackToHome={() => setCurrentView('home')}
            onBalanceUpdate={(newBal) => setWalletBalance(newBal)}
          />
        )}

        {currentView === 'packages' && (
          <PackagesView
            onBackToHome={() => setCurrentView('home')}
            onBookingComplete={handleBookingComplete}
            onBookingError={handleBookingError}
            currentUser={currentUser}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        )}

        {currentView === 'transactions' && (
          <TransactionsView
            transactions={transactions}
            onBackToHome={() => setCurrentView('home')}
          />
        )}

        {currentView === 'bookings' && (
          <BookingsView
            bookings={bookings}
            onBackToHome={() => setCurrentView('home')}
          />
        )}

        {currentView === 'rag' && (
          <RagExplorerView onBackToHome={() => setCurrentView('home')} />
        )}

        {currentView === 'admin' && (
          <AdminView
            onBackToHome={() => setCurrentView('home')}
          />
        )}

        {currentView === 'support' && (
          <SupportView
            onBackToHome={() => setCurrentView('home')}
          />
        )}

        {currentView === 'about' && (
          <AboutView
            onBackToHome={() => setCurrentView('home')}
          />
        )}
      </div>
      </Suspense>
    </div>
  );
}
