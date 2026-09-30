import React, { useState, useEffect, lazy, Suspense } from 'react';
import axios from 'axios';
import { recoverPendingPayment } from './utils/razorpay';
import Header from './components/Header';
import ChatBox from './components/Chat/ChatBox';
import RightSidebar from './components/Sidebar/RightSidebar';
import LeftDrawer from './components/Sidebar/LeftDrawer';
import AuthModal from './components/Auth/AuthModal';
import TestModeBanner from './components/Payment/TestModeBanner';

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
    const headerTitle = isWallet ? "🎉 **Payment Received — paid from TravoAI Wallet**" : "🎉 **Booking Confirmed**";
    const paymentLine = isWallet
      ? `* **Paid from Wallet**: ₹${nominal.toLocaleString('en-IN')}\n* **Remaining Balance**: ₹${Number(booking.remaining_wallet_balance || 0).toLocaleString('en-IN')}`
      : `* **Invoice Total**: ₹${nominal.toLocaleString('en-IN')}\n* **Charged via Razorpay now**: ₹${nominal.toLocaleString('en-IN')}`;

    const invoiceLine = booking.invoice
      ? `\n* **Invoice No.**: \`${booking.invoice.invoice_no}\``
      : '';

    const botMsg = {
      sender: 'bot',
      text: `${headerTitle}\n\n* **Item**: ${booking.item_name}\n* **PNR Number**: \`${booking.pnr}\`\n* **Ticket Number**: \`${booking.ticket_number}\`\n* **Booking ID**: \`${booking.booking_id}\`\n* **Transaction ID**: \`${booking.txn_id || 'TXN-CONFIRMED'}\`${invoiceLine}\n${paymentLine}\n\nYour payment receipt is ready. Supplier confirmation is pending — open them from the card below or under **My Bookings**.`,
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
    setLoading(true);

    if (currentUser?.username) {
      axios.post('/api/chat/save-user-message', { message: userMsg }).catch(e => e);
    }

    try {
      const response = await axios.post('/chat', {
        message: userText,
        sessionId: sessionId,
        userCity: activeCity
      });

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
        sources: data.sources || []
      };

      setMessages((prev) => [...prev, botMsg]);

      if (currentUser?.username) {
        axios.post('/api/chat/save-user-message', { message: botMsg }).catch(e => e);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const status = error.response?.status;

      // The server sends its own quota-style message for 429/503; only fall
      // back to a generic line when it could not be reached at all.
      const text =
        error.response?.data?.text ||
        (status === 429
          ? "🔌 **API tokens exhausted** — too many requests in a short time. Please wait a moment and try again."
          : status
            ? "🔌 **API tokens exhausted** — the AI service quota for this session has run out. Please try again in a few minutes."
            : "📡 **Can't reach the TravoAI server.** Make sure the backend is running (`npm start`), then try again.");

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
      <TestModeBanner />

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
