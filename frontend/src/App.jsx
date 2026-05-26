import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import Dashboard from './components/Dashboard';

function App() {
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'dashboard'
  const [conversations, setConversations] = useState([]);
  const [activeConvoId, setActiveConvoId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toast, setToast] = useState(null);

  // Selected completion settings
  const [provider, setProvider] = useState('mock');
  const [model, setModel] = useState('mock-model');

  // Backend URL helper (defaults to proxy relative path)
  const API_BASE = '/api';

  // 1. Fetch conversations list
  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        // Autofocus the first conversation if none is active
        if (data.length > 0 && !activeConvoId) {
          setActiveConvoId(data[0].id);
          // Set active provider/model based on active conversation settings
          setProvider(data[0].provider || 'mock');
          setModel(data[0].model || 'mock-model');
        }
      }
    } catch (err) {
      showToast('Could not load chat sessions. Connection refused.', 'error');
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  // 2. Fetch messages when conversation changes
  useEffect(() => {
    if (!activeConvoId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${API_BASE}/conversations/${activeConvoId}/messages`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch (err) {
        showToast('Error retrieving conversation messages.', 'error');
      }
    };

    fetchMessages();
  }, [activeConvoId]);

  // Toast Helper
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 3. Start New Session
  const handleStartNewChat = async () => {
    const defaultTitle = `Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    try {
      const res = await fetch(`${API_BASE}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: defaultTitle,
          provider: provider,
          model: model
        })
      });

      if (res.ok) {
        const newConvo = await res.json();
        setConversations(prev => [newConvo, ...prev]);
        setActiveConvoId(newConvo.id);
        setActiveView('chat');
        showToast('New conversation initialized.', 'success');
      } else {
        showToast('Failed to create new chat session.', 'error');
      }
    } catch (err) {
      showToast('Network error starting chat session.', 'error');
    }
  };

  // 4. Delete / Soft Cancel Session
  const handleDeleteChat = async (id, e) => {
    e.stopPropagation(); // Avoid triggering convo switch
    try {
      const res = await fetch(`${API_BASE}/conversations/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConvoId === id) {
          const remaining = conversations.filter(c => c.id !== id);
          if (remaining.length > 0) {
            setActiveConvoId(remaining[0].id);
          } else {
            setActiveConvoId(null);
          }
        }
        showToast('Conversation successfully soft-cancelled.', 'success');
      } else {
        showToast('Failed to delete conversation.', 'error');
      }
    } catch (err) {
      showToast('Connection error, could not cancel conversation.', 'error');
    }
  };

  return (
    <div className="app-layout">
      {/* Dynamic Toast Notifications */}
      {toast && (
        <div className={`toast-banner ${toast.type}`}>
          <span>🚀</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Sidebar Panel */}
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        conversations={conversations}
        activeConvoId={activeConvoId}
        setActiveConvoId={(id) => {
          setActiveConvoId(id);
          const convo = conversations.find(c => c.id === id);
          if (convo) {
            setProvider(convo.provider || 'mock');
            setModel(convo.model || 'mock-model');
          }
        }}
        onStartNewChat={handleStartNewChat}
        onDeleteChat={handleDeleteChat}
      />

      {/* Main Panel Viewport */}
      <main className="main-view">
        {activeView === 'chat' ? (
          <ChatWindow
            activeConvoId={activeConvoId}
            messages={messages}
            setMessages={setMessages}
            isStreaming={isStreaming}
            setIsStreaming={setIsStreaming}
            provider={provider}
            setProvider={setProvider}
            model={model}
            setModel={setModel}
            showToast={showToast}
            onStartNewChat={handleStartNewChat}
            refreshConversations={fetchConversations}
          />
        ) : (
          <Dashboard showToast={showToast} />
        )}
      </main>
    </div>
  );
}

export default App;
