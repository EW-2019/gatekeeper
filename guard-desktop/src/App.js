import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './App.css';

const API_BASE = '/api';
const socket = io();
const LOGO = `${process.env.PUBLIC_URL}/logo.jpg`;

function classificationLabel(classification, cancelled) {
  if (cancelled) return 'ተሰርዟል';
  if ((classification || '').toLowerCase() === 'classified') return 'ሚስጥራዊ';
  return 'ክፍት';
}

function durationLabel(type) {
  if ((type || '').toLowerCase() === 'days') return 'ቀናት';
  return 'ሰዓታት';
}

function senderLabel(sender) {
  if (sender === 'command') return 'ትዕዛዝ';
  if (sender === 'guard') return 'ጠባቂ';
  return sender;
}

function matchesSearch(item, nameQuery, phoneQuery) {
  const nameQ = nameQuery.trim().toLowerCase();
  const phoneQ = phoneQuery.trim();
  const name = `${item.guest_name || ''} ${item.guest_rank || ''}`.toLowerCase();
  const phone = String(item.guest_phone || '');
  const nameOk = !nameQ || name.includes(nameQ);
  const phoneOk = !phoneQ || phone.includes(phoneQ);
  if (nameQ && phoneQ) return nameOk || phoneOk;
  return nameOk && phoneOk;
}

function Countdown({ expiresAt, isCancelled }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (isCancelled) {
      setTimeLeft('ተቋርጧል');
      return;
    }

    const calculateTime = () => {
      const now = new Date().getTime();
      const expiry = new Date(expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeLeft('ጊዜው አልቋል');
        setIsExpired(true);
        return;
      }

      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const hStr = String(hours).padStart(2, '0');
      const mStr = String(minutes).padStart(2, '0');
      const sStr = String(seconds).padStart(2, '0');

      setTimeLeft(`${hStr} ሰ ${mStr} ደ ${sStr} ሰከ`);
      setIsExpired(false);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, isCancelled]);

  if (isCancelled) {
    return <span className="countdown-badge alert-red">{timeLeft}</span>;
  }

  return (
    <span className={`countdown-badge ${isExpired ? 'expired' : 'active'}`}>
      {timeLeft}
    </span>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [checkedIn, setCheckedIn] = useState([]);
  const [nameQuery, setNameQuery] = useState('');
  const [phoneQuery, setPhoneQuery] = useState('');

  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_BASE}/guard/appointments`);
      setPending(res.data.active || []);
      setCheckedIn(res.data.checkedIn || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchChat = async () => {
    try {
      const res = await axios.get(`${API_BASE}/chat/messages`);
      setMessages(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
    fetchChat();

    socket.on('new_appointment', () => fetchData());
    socket.on('status_change', () => fetchData());
    socket.on('appointment_cancelled', () => fetchData());

    socket.on('new_chat_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (msg.sender === 'command') {
        setUnreadCount((prev) => prev + 1);
      }
    });

    socket.on('chat_cleared', () => {
      setMessages([]);
      setUnreadCount(0);
    });

    const interval = setInterval(fetchData, 3000);
    return () => {
      socket.off('new_appointment');
      socket.off('status_change');
      socket.off('appointment_cancelled');
      socket.off('new_chat_message');
      socket.off('chat_cleared');
      clearInterval(interval);
    };
  }, []);

  const handleCheckIn = async (id) => {
    try {
      await axios.post(`${API_BASE}/guard/checkin/${id}`);
      fetchData();
    } catch (err) {
      alert('መግቢያ ማረጋገጥ አልተቻለም።');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    try {
      await axios.post(`${API_BASE}/chat/messages`, {
        sender: 'guard',
        message: chatInput
      });
      setChatInput('');
    } catch (err) {
      alert('መልእክት መላክ አልተቻለም');
    }
  };

  const handleClearChat = async () => {
    try {
      await axios.delete(`${API_BASE}/chat/messages`);
    } catch (err) {
      alert('ውይይቱን ማጽዳት አልተቻለም');
    }
  };

  const isCancelledStatus = (status) => {
    if (!status) return false;
    const s = status.toUpperCase();
    return s === 'CANCELLED' || s === 'FLAGGED' || s === 'DISMISSED';
  };

  const sourceList = activeTab === 'pending' ? pending : checkedIn;
  const filteredList = useMemo(
    () => sourceList.filter((item) => matchesSearch(item, nameQuery, phoneQuery)),
    [sourceList, nameQuery, phoneQuery]
  );

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={LOGO} alt="የበር ጠባቂ አርማ" />
          <div>
            <h1>የበር ጠባቂ መቆጣጠሪያ</h1>
            <p>እንግዶችን በስም ወይም በስልክ ይፈልጉ እና መግቢያ ያረጋግጡ</p>
          </div>
        </div>
        <div className="tab-buttons">
          <button
            className={activeTab === 'pending' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('pending')}
          >
            በመጠባበቅ ላይ ({pending.length})
          </button>
          <button
            className={activeTab === 'checked_in' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('checked_in')}
          >
            የገቡ እንግዶች ({checkedIn.length})
          </button>
          <button
            className="btn-chat-toggle"
            onClick={() => {
              setShowChat(!showChat);
              setUnreadCount(0);
            }}
          >
            ውይይት {unreadCount > 0 && <span className="chat-badge">{unreadCount}</span>}
          </button>
        </div>
      </header>

      {showChat && (
        <div className="chat-drawer">
          <div className="chat-header">
            <h3>ከትዕዛዝ ጋር ውይይት</h3>
            <div>
              <button className="btn-clear-chat" onClick={handleClearChat}>አጽዳ</button>
              <button className="btn-close-chat" onClick={() => setShowChat(false)}>ዝጋ</button>
            </div>
          </div>
          <div className="chat-body">
            {messages.map((m) => (
              <div key={m.id || Math.random()} className={`chat-bubble ${m.sender}`}>
                <strong>{senderLabel(m.sender)}:</strong> {m.message}
              </div>
            ))}
            {messages.length === 0 && <p className="empty-chat">እስካሁን መልእክት የለም።</p>}
          </div>
          <form className="chat-footer" onSubmit={handleSendMessage}>
            <input
              type="text"
              placeholder="ለትዕዛዝ መልእክት ይጻፉ..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button type="submit">ላክ</button>
          </form>
        </div>
      )}

      <main className="main-container">
        <section className="search-panel">
          <div className="search-field">
            <label htmlFor="searchName">በእንግዳ ስም ፈልግ</label>
            <div className="search-input">
              <img src={LOGO} alt="" />
              <input
                id="searchName"
                type="search"
                placeholder="ስም ያስገቡ"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="search-field">
            <label htmlFor="searchPhone">በእንግዳ ስልክ ፈልግ</label>
            <div className="search-input">
              <img src={LOGO} alt="" />
              <input
                id="searchPhone"
                type="search"
                placeholder="ስልክ ቁጥር ያስገቡ"
                value={phoneQuery}
                onChange={(e) => setPhoneQuery(e.target.value)}
              />
            </div>
          </div>
        </section>

        {activeTab === 'pending' ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ምደባ</th>
                  <th>የእንግዳ ስም እና ማዕረግ</th>
                  <th>የእንግዳ ስልክ</th>
                  <th>የቀጠሮ ሰጪ</th>
                  <th>የቀጠሮ ሰጪ ስልክ</th>
                  <th>የቆይታ ጊዜ</th>
                  <th>እርምጃ</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((item) => {
                  const cancelled = isCancelledStatus(item.status);
                  return (
                    <tr key={item.id} className={cancelled ? 'row-cancelled' : ''}>
                      <td>
                        <span className={`badge ${cancelled ? 'badge-cancelled' : (item.classification || 'unclassified')}`}>
                          {classificationLabel(item.classification, cancelled)}
                        </span>
                      </td>
                      <td className="strong-text">{item.guest_rank} {item.guest_name}</td>
                      <td>{item.guest_phone}</td>
                      <td>{item.appointer_rank} {item.appointer_name}</td>
                      <td>{item.appointer_phone}</td>
                      <td>{item.stay_duration_value} {durationLabel(item.stay_duration_type)}</td>
                      <td>
                        {cancelled ? (
                          <span className="text-alert">መግቢያ ተከልክሏል</span>
                        ) : (
                          <button className="btn-checkin" onClick={() => handleCheckIn(item.id)}>
                            መግቢያ ፍቀድ
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredList.length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-cell">
                      {sourceList.length === 0
                        ? 'በመጠባበቅ ላይ ያለ እንግዳ የለም።'
                        : 'በዚህ ፍለጋ የሚዛመድ እንግዳ አልተገኘም።'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ምደባ / ማስጠንቀቂያ</th>
                  <th>የእንግዳ ስም እና ማዕረግ</th>
                  <th>የእንግዳ ስልክ</th>
                  <th>ቀጠሮ ሰጪ</th>
                  <th>የገባበት ሰዓት</th>
                  <th>እስከ</th>
                  <th>የቀረ ጊዜ</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((item) => {
                  const cancelled = isCancelledStatus(item.status);
                  return (
                    <tr key={item.id} className={cancelled ? 'row-cancelled' : ''}>
                      <td>
                        <span className={`badge ${cancelled ? 'badge-cancelled' : (item.classification || 'unclassified')}`}>
                          {cancelled ? 'ፈቃድ ተሰርዟል' : classificationLabel(item.classification, false)}
                        </span>
                      </td>
                      <td className="strong-text">{item.guest_rank} {item.guest_name}</td>
                      <td>{item.guest_phone}</td>
                      <td>{item.appointer_rank} {item.appointer_name}</td>
                      <td>{item.checked_in_at ? new Date(item.checked_in_at).toLocaleTimeString() : '—'}</td>
                      <td>{item.expires_at ? new Date(item.expires_at).toLocaleTimeString() : '—'}</td>
                      <td>
                        {cancelled ? (
                          <span className="badge-cancelled">እንግዳውን ወዲያውኑ አውጡ</span>
                        ) : (
                          <Countdown expiresAt={item.expires_at} isCancelled={false} />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredList.length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-cell">
                      {sourceList.length === 0
                        ? 'አሁን የገባ እንግዳ የለም።'
                        : 'በዚህ ፍለጋ የሚዛመድ እንግዳ አልተገኘም።'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
