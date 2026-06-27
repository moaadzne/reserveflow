import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Dashboard.css';

function Dashboard({ user, token }) {
  const [reservations, setReservations] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    room: '',
    checkIn: '',
    checkOut: '',
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    source: 'manual',
    amount: '',
    status: 'confirmed',
    notes: '',
  });

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  const axiosConfig = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  // Load reservations and stats
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [resRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/api/reservations`, axiosConfig),
        axios.get(`${API_URL}/api/stats`, axiosConfig),
      ]);

      setReservations(resRes.data);
      setStats(statsRes.data);
    } catch (err) {
      setError('Erreur lors du chargement des données');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.room || !formData.checkIn || !formData.checkOut || !formData.guestName) {
      setError('Veuillez remplir les champs obligatoires');
      return;
    }

    try {
      if (editingId) {
        // Update
        await axios.put(`${API_URL}/api/reservations/${editingId}`, formData, axiosConfig);
      } else {
        // Create
        await axios.post(`${API_URL}/api/reservations`, formData, axiosConfig);
      }

      // Reset form
      setFormData({
        room: '',
        checkIn: '',
        checkOut: '',
        guestName: '',
        guestEmail: '',
        guestPhone: '',
        source: 'manual',
        amount: '',
        status: 'confirmed',
        notes: '',
      });
      setShowForm(false);
      setEditingId(null);

      // Reload data
      loadData();
    } catch (err) {
      setError('Erreur lors de l\'enregistrement');
      console.error(err);
    }
  };

  const handleEdit = (reservation) => {
    setFormData({
      room: reservation.room,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail || '',
      guestPhone: reservation.guestPhone || '',
      source: reservation.source || 'manual',
      amount: reservation.amount || '',
      status: reservation.status || 'confirmed',
      notes: reservation.notes || '',
    });
    setEditingId(reservation.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette réservation ?')) return;

    try {
      await axios.delete(`${API_URL}/api/reservations/${id}`, axiosConfig);
      loadData();
    } catch (err) {
      setError('Erreur lors de la suppression');
      console.error(err);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      room: '',
      checkIn: '',
      checkOut: '',
      guestName: '',
      guestEmail: '',
      guestPhone: '',
      source: 'manual',
      amount: '',
      status: 'confirmed',
      notes: '',
    });
  };

  if (loading) {
    return <div className="dashboard-loading">⏳ Chargement des données...</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-container">
        {/* STATS CARDS */}
        <div className="stats-section">
          <h2 className="section-title">📊 Vue d'ensemble (30 derniers jours)</h2>

          {stats && (
            <div className="stats-grid">
              <div className="stat-card revenue">
                <div className="stat-icon">💰</div>
                <div className="stat-content">
                  <p className="stat-label">Revenu Total</p>
                  <p className="stat-value">{stats.totalRevenue.toFixed(2)}€</p>
                </div>
              </div>

              <div className="stat-card reservations">
                <div className="stat-icon">📅</div>
                <div className="stat-content">
                  <p className="stat-label">Réservations</p>
                  <p className="stat-value">{stats.reservationCount}</p>
                </div>
              </div>

              <div className="stat-card average">
                <div className="stat-icon">🏆</div>
                <div className="stat-content">
                  <p className="stat-label">Moyenne par Nuit</p>
                  <p className="stat-value">{stats.averageNightly.toFixed(2)}€</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ERROR MESSAGE */}
        {error && (
          <div className="error-banner">
            <span>❌ {error}</span>
            <button onClick={() => setError('')} className="close-error">✕</button>
          </div>
        )}

        {/* ADD RESERVATION BUTTON */}
        {!showForm && (
          <div className="add-reservation-section">
            <button onClick={() => setShowForm(true)} className="add-btn">
              ➕ Ajouter une Réservation
            </button>
          </div>
        )}

        {/* FORM */}
        {showForm && (
          <div className="form-section">
            <h2 className="form-title">
              {editingId ? '✏️ Modifier Réservation' : '✨ Nouvelle Réservation'}
            </h2>

            <form onSubmit={handleSubmit} className="reservation-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Numéro de Chambre *</label>
                  <input
                    type="text"
                    name="room"
                    placeholder="ex: 101, Deluxe Suite"
                    value={formData.room}
                    onChange={handleFormChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Nom du Client *</label>
                  <input
                    type="text"
                    name="guestName"
                    placeholder="Jean Dupont"
                    value={formData.guestName}
                    onChange={handleFormChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Date d'Arrivée *</label>
                  <input
                    type="date"
                    name="checkIn"
                    value={formData.checkIn}
                    onChange={handleFormChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Date de Départ *</label>
                  <input
                    type="date"
                    name="checkOut"
                    value={formData.checkOut}
                    onChange={handleFormChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    name="guestEmail"
                    placeholder="client@email.com"
                    value={formData.guestEmail}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="form-group">
                  <label>Téléphone</label>
                  <input
                    type="tel"
                    name="guestPhone"
                    placeholder="+33 6 12 34 56 78"
                    value={formData.guestPhone}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Source</label>
                  <select name="source" value={formData.source} onChange={handleFormChange}>
                    <option value="manual">Manuel</option>
                    <option value="booking">Booking.com</option>
                    <option value="expedia">Expedia</option>
                    <option value="airbnb">Airbnb</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Montant (€)</label>
                  <input
                    type="number"
                    name="amount"
                    placeholder="250.00"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Statut</label>
                  <select name="status" value={formData.status} onChange={handleFormChange}>
                    <option value="confirmed">Confirmée</option>
                    <option value="pending">En attente</option>
                    <option value="cancelled">Annulée</option>
                    <option value="completed">Terminée</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  name="notes"
                  placeholder="Remarques supplémentaires..."
                  rows="3"
                  value={formData.notes}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-buttons">
                <button type="submit" className="submit-btn">
                  {editingId ? '💾 Mettre à jour' : '✅ Ajouter'}
                </button>
                <button type="button" onClick={handleCancel} className="cancel-btn">
                  ❌ Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        {/* RESERVATIONS LIST */}
        <div className="reservations-section">
          <h2 className="section-title">📋 Toutes les Réservations</h2>

          {reservations.length === 0 ? (
            <div className="empty-state">
              <p>📭 Aucune réservation pour le moment</p>
              <button onClick={() => setShowForm(true)} className="empty-add-btn">
                Ajouter la première
              </button>
            </div>
          ) : (
            <div className="reservations-list">
              {reservations.map((reservation) => (
                <div key={reservation.id} className={`reservation-card status-${reservation.status}`}>
                  <div className="reservation-header">
                    <div className="reservation-title">
                      <h3>Chambre {reservation.room}</h3>
                      <span className={`status-badge status-${reservation.status}`}>
                        {reservation.status === 'confirmed' && '✅ Confirmée'}
                        {reservation.status === 'pending' && '⏳ En attente'}
                        {reservation.status === 'cancelled' && '❌ Annulée'}
                        {reservation.status === 'completed' && '✔️ Terminée'}
                      </span>
                    </div>
                    <div className="reservation-amount">
                      {reservation.amount ? `${parseFloat(reservation.amount).toFixed(2)}€` : '-'}
                    </div>
                  </div>

                  <div className="reservation-details">
                    <div className="detail">
                      <span className="label">👤 Client:</span>
                      <span className="value">{reservation.guestName}</span>
                    </div>
                    <div className="detail">
                      <span className="label">📅 Arrivée:</span>
                      <span className="value">{new Date(reservation.checkIn).toLocaleDateString('fr-FR')}</span>
                    </div>
                    <div className="detail">
                      <span className="label">🚪 Départ:</span>
                      <span className="value">{new Date(reservation.checkOut).toLocaleDateString('fr-FR')}</span>
                    </div>
                    {reservation.guestEmail && (
                      <div className="detail">
                        <span className="label">📧 Email:</span>
                        <span className="value">{reservation.guestEmail}</span>
                      </div>
                    )}
                    {reservation.guestPhone && (
                      <div className="detail">
                        <span className="label">📞 Téléphone:</span>
                        <span className="value">{reservation.guestPhone}</span>
                      </div>
                    )}
                    <div className="detail">
                      <span className="label">🔗 Source:</span>
                      <span className="value">{reservation.source || 'Manuel'}</span>
                    </div>
                    {reservation.notes && (
                      <div className="detail">
                        <span className="label">📝 Notes:</span>
                        <span className="value">{reservation.notes}</span>
                      </div>
                    )}
                  </div>

                  <div className="reservation-actions">
                    <button
                      onClick={() => handleEdit(reservation)}
                      className="edit-btn"
                      title="Modifier"
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(reservation.id)}
                      className="delete-btn"
                      title="Supprimer"
                    >
                      🗑️ Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
