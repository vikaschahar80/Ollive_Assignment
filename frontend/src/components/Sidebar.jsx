import React from 'react';
import { MessageSquare, BarChart3, Plus, Trash2, Cpu } from 'lucide-react';

function Sidebar({
  activeView,
  setActiveView,
  conversations,
  activeConvoId,
  setActiveConvoId,
  onStartNewChat,
  onDeleteChat
}) {
  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Cpu size={22} className="accent-secondary" />
          <span>Ollive Log</span>
        </div>
        <div className="sidebar-logo-dot"></div>
      </div>

      {/* Initialize Session Trigger */}
      <button className="new-chat-btn" onClick={onStartNewChat}>
        <Plus size={16} />
        <span>New Chat Session</span>
      </button>

      {/* Conversations Session Feed */}
      <div className="conversation-list-container">
        <div className="section-title">Active Traces</div>
        {conversations.length === 0 ? (
          <div style={{ padding: '12px 8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            No active conversations
          </div>
        ) : (
          conversations.map((convo) => (
            <button
              key={convo.id}
              className={`convo-item ${activeConvoId === convo.id ? 'active' : ''}`}
              onClick={() => {
                setActiveConvoId(convo.id);
                setActiveView('chat');
              }}
            >
              <MessageSquare size={16} style={{ flexShrink: 0 }} />
              <div className="convo-details">
                <span className="convo-title">{convo.title}</span>
                <span className="convo-meta">
                  {convo.provider} • {convo.model.replace('-model', '')}
                </span>
              </div>
              <button
                className="delete-convo-btn"
                title="Soft cancel conversation logs"
                onClick={(e) => onDeleteChat(convo.id, e)}
              >
                <Trash2 size={13} />
              </button>
            </button>
          ))
        )}
      </div>

      {/* Lower Workspace Controls */}
      <nav className="sidebar-nav">
        <button
          className={`nav-item ${activeView === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveView('chat')}
        >
          <MessageSquare size={18} />
          <span>Chat Client</span>
        </button>
        <button
          className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          <BarChart3 size={18} />
          <span>Telemetry Dashboard</span>
        </button>
      </nav>
    </aside>
  );
}

export default Sidebar;
