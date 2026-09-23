import React, { useState } from 'react';
import './App.css';

const MESSAGES = {
  invalidId: 'ልክ ያልሆነ ወይም ያልተፈቀደ 8-አሃዝ መለያ',
  connectFail: 'ከሰርቨሩ ጋር መገናኘት አልተቻለም።',
  submitFail: 'ቀጠሮውን መላክ አልተቻለም',
  submitConnectFail: 'ቀጠሮ በመላክ ላይ የግንኙነት ስህተት ተፈጥሯል።',
  success: 'ቀጠሮው በተሳካ ሁኔታ ተመዝግቦ ወደ ጠባቂው በር ተልኳል!',
};

function App() {
  const [employeeId, setEmployeeId] = useState('');
  const [authorizedUser, setAuthorizedUser] = useState(null);
  const [error, setError] = useState('');

  const [appointerPhone, setAppointerPhone] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestRank, setGuestRank] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [reason, setReason] = useState('');
  const [classification, setClassification] = useState('unclassified');
  const [stayDurationType, setStayDurationType] = useState('hours');
  const [stayDurationValue, setStayDurationValue] = useState(2);
  const [successMsg, setSuccessMsg] = useState('');

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`/api/verify-id/${employeeId}`);
      const data = await res.json();
      if (res.ok && data.valid) {
        setAuthorizedUser(data.employee);
      } else {
        setError(MESSAGES.invalidId);
      }
    } catch (err) {
      setError(MESSAGES.connectFail);
    }
  };

  const handleSubmitAppointment = async (e) => {
    e.preventDefault();
    setSuccessMsg('');
    setError('');

    const payload = {
      appointer_id: authorizedUser.employee_id,
      appointer_name: authorizedUser.name,
      appointer_rank: authorizedUser.rank,
      appointer_phone: appointerPhone,
      guest_name: guestName,
      guest_rank: guestRank,
      guest_phone: guestPhone,
      reason: reason,
      classification: classification,
      stay_duration_type: stayDurationType,
      stay_duration_value: parseInt(stayDurationValue)
    };

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setSuccessMsg(MESSAGES.success);
        setGuestName('');
        setGuestRank('');
        setGuestPhone('');
        setReason('');
      } else {
        setError(MESSAGES.submitFail);
      }
    } catch (err) {
      setError(MESSAGES.submitConnectFail);
    }
  };

  return (
    <div className="page">
      <div className="glow" aria-hidden="true" />
      <main className="card">
        <header className="card-header">
          <img
            className="brand-logo"
            src={`${process.env.PUBLIC_URL}/logo.jpg`}
            alt="የቀጠሮ ሰጪ አርማ"
          />
          <div className="badge">ቀጠሮ</div>
          <h1>የቀጠሮ ሰጪ መግቢያ</h1>
          <p className="subtitle">እንግዳ ለመቀበል መለያዎን ያረጋግጡ እና ቀጠሮ ይመዝግቡ</p>
        </header>

        {!authorizedUser ? (
          <form onSubmit={handleVerify} className="form">
            <h2 className="section-title">የተፈቀደ 8-አሃዝ መለያ ያስገቡ</h2>
            <div className="field">
              <label htmlFor="employeeId">የሰራተኛ መለያ</label>
              <input
                id="employeeId"
                type="text"
                inputMode="numeric"
                maxLength="8"
                placeholder="ለምሳሌ 12345678"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn">መለያ አረጋግጥ</button>
            {error && <p className="msg error">{error}</p>}
          </form>
        ) : (
          <form onSubmit={handleSubmitAppointment} className="form">
            <div className="user-banner">
              <span className="user-label">የተፈቀደ ቀጠሮ ሰጪ</span>
              <strong>{authorizedUser.rank} {authorizedUser.name}</strong>
              <span className="user-id">{authorizedUser.employee_id}</span>
            </div>

            <div className="field">
              <label htmlFor="appointerPhone">የቀጠሮ ሰጪ ስልክ</label>
              <input
                id="appointerPhone"
                type="tel"
                value={appointerPhone}
                onChange={(e) => setAppointerPhone(e.target.value)}
                required
              />
            </div>

            <h2 className="section-title">የእንግዳ ዝርዝር</h2>

            <div className="field">
              <label htmlFor="guestName">የእንግዳ ሙሉ ስም</label>
              <input
                id="guestName"
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="guestRank">የእንግዳ ማዕረግ / ሹመት</label>
              <input
                id="guestRank"
                type="text"
                value={guestRank}
                onChange={(e) => setGuestRank(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="guestPhone">የእንግዳ ስልክ</label>
              <input
                id="guestPhone"
                type="tel"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="reason">የጉብኝት ምክንያት</label>
              <textarea
                id="reason"
                rows="3"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="classification">የምደባ ደረጃ</label>
                <select
                  id="classification"
                  value={classification}
                  onChange={(e) => setClassification(e.target.value)}
                >
                  <option value="unclassified">ክፍት</option>
                  <option value="classified">ሚስጥራዊ</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="stayDurationValue">የቆይታ ጊዜ</label>
                <div className="duration">
                  <input
                    id="stayDurationValue"
                    type="number"
                    min="1"
                    value={stayDurationValue}
                    onChange={(e) => setStayDurationValue(e.target.value)}
                    required
                  />
                  <select
                    value={stayDurationType}
                    onChange={(e) => setStayDurationType(e.target.value)}
                    aria-label="የቆይታ አይነት"
                  >
                    <option value="hours">ሰዓታት</option>
                    <option value="days">ቀናት</option>
                  </select>
                </div>
              </div>
            </div>

            <button type="submit" className="btn">ቀጠሮ ላክ</button>

            {successMsg && <p className="msg success">{successMsg}</p>}
            {error && <p className="msg error">{error}</p>}
          </form>
        )}
      </main>
    </div>
  );
}

export default App;
