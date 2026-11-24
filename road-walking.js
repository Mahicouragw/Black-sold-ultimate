// All travel goes through ordinary world movement: no teleport or simulated steps.
window.RoadWalking = (() => {
    const chapters = {
        royal_palace: 'The king’s dispatch begins at the palace. Find the courier who carries letters between the hall and the library.',
        grand_temple: 'Follow the bells from the palace district to Auralis. At the temple, learn where a wounded traveler can recover.',
        forest: 'Leave the city for the trees. Listen as stone footsteps give way to leaves; the road is no longer safe.'
    };
    function bind(game) {
        const follow = document.getElementById('road-step'), target = document.getElementById('road-target');
        if (!follow || follow.dataset.bound) return;
        follow.dataset.bound = 'true';
        const note = document.getElementById('road-note');
        let hold = null, suppress = null;
        function stop() {
            if (!hold) return;
            clearTimeout(hold.timer);
            if (hold.ownsStep && game._movementPending) game.cancelPendingMovement();
            hold = null;
        }
        function unavailable() {
            return !game.state.player || game.state.screen !== 'game-screen' || game.state.inCombat || game.state.combatTransition || document.hidden ||
                Array.from(document.querySelectorAll('.panel:not(.hidden),[role="dialog"]:not(.hidden)')).some(p => !p.closest('[hidden],.hidden,[aria-hidden="true"]') && p.getClientRects().length);
        }
        function step(button) {
            if (unavailable()) return false;
            if (game._movementPending) return false;
            let dir = button.dataset.cmd;
            if (button === follow) {
                const route = game.findPhysicalRoute(game.state.location, target.value);
                if (!route?.length) {
                    note.textContent = route ? `Destination reached: ${WorldData.locations[target.value].name}.` : 'No open road from here. Look around for another exit.';
                    return false;
                }
                dir = route[0];
            }
            game.processCommand(dir);
            return !!game._movementPending;
        }
        for (const button of [...document.querySelectorAll('.dir-btn'),follow]) {
            button.addEventListener('pointerdown', e => {
                if (e.button !== 0 || e.isPrimary === false) return;
                stop(); suppress = null;
                const state = hold = {id:e.pointerId,button};
                button.setPointerCapture?.(e.pointerId);
                function repeat() {
                    if (state !== hold) return;
                    suppress = button;
                    state.ownsStep = step(button);
                    if (!state.ownsStep) { stop(); return; }
                    state.timer = setTimeout(repeat, 1150);
                }
                state.timer = setTimeout(repeat,500);
            });
            button.addEventListener('click', e => {
                if (suppress === button && e.detail !== 0) { suppress = null; return; }
                step(button);
            });
            button.addEventListener('lostpointercapture', e => { if (hold?.id === e.pointerId) stop(); });
        }
        for (const event of ['pointerup','pointercancel']) document.addEventListener(event,e=>{ if(hold?.id===e.pointerId) stop(); });
        window.addEventListener('blur',stop);document.addEventListener('visibilitychange',stop);
        // Panels can open via keyboard/voice while a 320 ms step is pending.
        new MutationObserver(()=>{ if(hold && unavailable()) stop(); }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','aria-hidden']});
        // Build from the finalized world, not a second set of fictional map links.
        // Opening the disclosure never moves the player or marks a location visited.
        const road = document.getElementById('story-road');
        road.addEventListener('toggle', () => {
            if (!road.open) { stop(); return; }
            if (target.querySelector('optgroup')) return;
            const rooms = Object.entries(WorldData.locations);
            const addGroup = (label, entries) => {
                const group = document.createElement('optgroup'); group.label = label;
                for (const [text,id] of entries) if (WorldData.locations[id]) group.append(new Option(text,id));
                if (group.children.length) target.append(group);
            };
            for (const city of window.CityDirectory?.cities || []) {
                addGroup(city.label, Object.entries(city.targets).map(([label,id]) => [label.replaceAll('_',' ') + ': ' + WorldData.locations[id]?.name,id]));
            }
            const regions = new Map();
            for (const [id,room] of rooms) if (room.region && !room.privateHouse && !regions.has(room.region)) regions.set(room.region,id);
            addGroup('Regional waypoints', [...regions].sort(([a],[b])=>a.localeCompare(b)).map(([region,id]) => [`${region}: ${WorldData.locations[id].name}`,id]));
        });
        function describe() {
            stop();note.textContent=chapters[target.value] || `Follow the mapped road to ${WorldData.locations[target.value].name}.`;
        }
        target.addEventListener('change',describe);describe();
        document.getElementById('road-rediscover').addEventListener('click', () => {
            if (!game.state.player || !window.confirm('Hear every place as new again? Quests, possessions and other heroes are not touched.')) return;
            stop(); game.state.player.roadDiscoveries = [];
            note.textContent = game.save() ? 'The road is new again for this hero.' : 'The road is new for now, though the device has not yet kept it.';
        });
    }
    return {bind};
})();
