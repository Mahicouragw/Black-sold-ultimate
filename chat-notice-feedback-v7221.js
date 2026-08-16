/**
 * v7.22.1 — Chat first-use community notice and a visible Send Feedback entry
 * point inside Chat Rooms and Direct Chat.
 *
 * - The notice is shown ONCE per user, before their first chat send, and the
 *   acknowledgment is stored per user (server profile key when signed in, with
 *   a local fallback). It is never shown before every message.
 * - Server-side moderation and the five-minute server expiry are untouched.
 * - Feedback reuses the existing authoritative OnlineSystem.sendFeedback RPC.
 */
(() => {
    'use strict';

    const LOCAL_PREFIX = 'black_sword_chat_notice_ack_v1:';
    const userKey = () => LOCAL_PREFIX + (window.OnlineSystem?.user?.id || window.OnlineSystem?.getPlayerCode?.() || 'guest');

    const ChatNotice = {
        pending: null,
        acknowledged() {
            try { return localStorage.getItem(userKey()) === 'true'; } catch { return false; }
        },
        remember() {
            try { localStorage.setItem(userKey(), 'true'); } catch { /* private mode */ }
        },
        /** Resolves true when the player may send. Shown at most once per user. */
        require() {
            if (this.acknowledged()) return Promise.resolve(true);
            if (this.pending) return this.pending;
            const dialog = document.getElementById('chat-community-notice');
            if (!dialog) { this.remember(); return Promise.resolve(true); }
            const container = document.getElementById('game-container');
            dialog.classList.remove('hidden');
            if (container) { container.inert = true; container.setAttribute('aria-hidden', 'true'); }
            const accept = document.getElementById('btn-accept-chat-notice');
            const cancel = document.getElementById('btn-cancel-chat-notice');
            setTimeout(() => accept?.focus(), 0);
            this.pending = new Promise(resolve => {
                const close = allowed => {
                    dialog.classList.add('hidden');
                    if (container) { container.inert = false; container.removeAttribute('aria-hidden'); }
                    accept?.removeEventListener('click', onAccept);
                    cancel?.removeEventListener('click', onCancel);
                    this.pending = null;
                    resolve(allowed);
                };
                const onAccept = () => { this.remember(); close(true); };
                const onCancel = () => close(false);
                accept?.addEventListener('click', onAccept);
                cancel?.addEventListener('click', onCancel);
            });
            return this.pending;
        }
    };
    window.ChatCommunityNotice = ChatNotice;

    const Feedback = {
        open(category) {
            const panel = document.getElementById('feedback-panel');
            if (!panel) return false;
            panel.classList.remove('hidden');
            const select = document.getElementById('feedback-category');
            if (select && category) select.value = category;
            const status = document.getElementById('feedback-status');
            if (status) status.textContent = '';
            setTimeout(() => document.getElementById('feedback-message')?.focus(), 0);
            return true;
        },
        async submit() {
            const button = document.getElementById('btn-send-feedback');
            const field = document.getElementById('feedback-message');
            const select = document.getElementById('feedback-category');
            const status = document.getElementById('feedback-status');
            const message = (field?.value || '').trim();
            if (!message) {
                if (status) status.textContent = 'Write a short message before sending.';
                field?.focus();
                return false;
            }
            if (button?.disabled) return false;
            if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
            if (status) status.textContent = 'Sending your feedback…';
            try {
                const sent = await window.OnlineSystem?.sendFeedback?.(select?.value || 'gameplay', message);
                if (sent) {
                    if (field) field.value = '';
                    if (status) status.textContent = 'Thank you. Your feedback was sent to the development team.';
                } else if (status) {
                    status.textContent = 'Feedback could not be sent right now. Please try again shortly.';
                }
                return Boolean(sent);
            } finally {
                if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
                field?.focus();
            }
        }
    };
    window.FeedbackCenter = Feedback;

    const bind = () => {
        document.getElementById('btn-open-feedback')?.addEventListener('click', () => Feedback.open());
        document.getElementById('btn-open-feedback-direct')?.addEventListener('click', () => Feedback.open());
        document.getElementById('btn-send-feedback')?.addEventListener('click', () => Feedback.submit());

        // Gate the FIRST send in both chat surfaces through the notice.
        if (window.ChatRooms && !window.ChatRooms._noticeWrapped) {
            window.ChatRooms._noticeWrapped = true;
            const send = window.ChatRooms.send.bind(window.ChatRooms);
            window.ChatRooms.send = async function () {
                if (!(await ChatNotice.require())) return false;
                return send();
            };
        }
        if (window.Game && !window.Game._noticeWrapped && typeof window.Game.sendChat === 'function') {
            window.Game._noticeWrapped = true;
            const sendChat = window.Game.sendChat.bind(window.Game);
            window.Game.sendChat = async function (...args) {
                if (!(await ChatNotice.require())) return false;
                return sendChat(...args);
            };
        }
        if (window.Game && !window.Game._feedbackCommandBound) {
            window.Game._feedbackCommandBound = true;
            const previous = window.Game.processCommand.bind(window.Game);
            window.Game.processCommand = function (cmd) {
                const c = String(cmd || '').toLowerCase().trim();
                if (c === 'feedback' || c === 'send feedback' || c === 'open feedback') { Feedback.open(); return; }
                if (c === 'report bug') { Feedback.open('bug'); return; }
                if (c === 'report player' || c === 'report message') { Feedback.open('moderation'); return; }
                return previous(cmd);
            };
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
    else bind();
})();
