/**
 * v7.43.0 — Halloween Event Voice Narration
 * Tells the story of the Night of Unspoken Names as players participate
 */
(() => {
    'use strict';

    const HalloweenNarration = {
        stories: {
            intro: [
                "The Night of Unspoken Names has begun. October fog crawls through the cemetery gates.",
                "Lanterns burn with ghostly light. Fragments of forgotten souls drift in the mist.",
                "They say if you fight in the cemetery, you can collect lantern fragments — pieces of the old magic.",
                "But be warned: the procession does not like to be watched."
            ],
            climax_intro: [
                "October 31st. The climax of the Night of Unspoken Names.",
                "The cemetery is alive with unseen steps. The procession approaches.",
                "Do not look at them. Listen for the last bell.",
                "Kill eight spirits to banish the procession and claim the year's protection."
            ],
            enter_cemetery: [
                "You step into the cemetery. The fog thickens around your feet.",
                "Strange whispers echo between the tombstones.",
                "Lantern fragments glow faintly among the graves.",
                "Fight the undead here to collect fragments of the old magic."
            ],
            fragment_collected: [
                "A lantern fragment rings once, then goes dark. You keep it without naming it.",
                "The fragment pulses with cold light. It whispers of forgotten names.",
                "You feel the weight of old magic in your hands. The lantern remembers.",
                "Another fragment joins your collection. The procession grows restless."
            ],
            kill_in_cemetery: [
                "The spirit falls, dissolving into mist. The cemetery grows quieter.",
                "Your blade passes through the undead. It shrieks and vanishes.",
                "Another enemy defeated. The lanterns flicker in approval.",
                "The cemetery accepts your offering. The procession pauses."
            ],
            climax_kill: [
                "The spirit shrieks and fades. The procession stumbles.",
                "Another foe falls. The last bell grows closer.",
                "The undead crumbles. You hear distant chanting fade.",
                "Your strike lands true. The procession weakens."
            ],
            halfway_climax: [
                "Four spirits banished. The procession falters.",
                "Halfway there. The lanterns burn brighter. The bell tolls again.",
                "Four down. Four more to silence the procession.",
                "The old magic stirs. Keep fighting. The climax approaches."
            ],
            near_completion: [
                "Seven spirits banished. One more. The procession trembles.",
                "Almost done. The last bell is close. Strike true.",
                "The procession reels. One more kill and the year is yours.",
                "The final spirit awaits. Banish it and claim the Night."
            ],
            victory: [
                "The last bell falls silent. The procession has passed.",
                "You kept the year. The Night of Unspoken Names is banished until next October.",
                "The cemetery grows still. The lanterns dim. You have earned the old magic's respect.",
                "Nine hundred gold and four hundred twenty experience points flow into you. The year is safe."
            ],
            refuse_look: [
                "The lantern blinds the living eye. Listen. Do not look.",
                "Do not examine the procession. They do not wish to be seen.",
                "Your eyes water. The fog thickens. Listen for the bell, not the faces.",
                "Looking invites their attention. Fight by sound, not sight."
            ]
        },

        speak(text, channel = 'halloween') {
            if (!window.AudioManager) return;
            window.AudioManager.playVoice(text, { channel, priority: false });
        },

        narrateIntro() {
            const story = this.stories.intro;
            const randomLine = story[Math.floor(Math.random() * story.length)];
            this.speak(randomLine);
        },

        narrateClimaxIntro() {
            const story = this.stories.climax_intro;
            const randomLine = story[Math.floor(Math.random() * story.length)];
            this.speak(randomLine);
        },

        narrateEnterCemetery() {
            const story = this.stories.enter_cemetery;
            const randomLine = story[Math.floor(Math.random() * story.length)];
            this.speak(randomLine);
        },

        narrateFragmentCollected() {
            const story = this.stories.fragment_collected;
            const randomLine = story[Math.floor(Math.random() * story.length)];
            this.speak(randomLine);
        },

        narrateKill(isClimax = false, killCount = 0) {
            if (isClimax) {
                if (killCount === 4) {
                    const halfway = this.stories.halfway_climax;
                    this.speak(halfway[Math.floor(Math.random() * halfway.length)]);
                } else if (killCount === 7) {
                    const near = this.stories.near_completion;
                    this.speak(near[Math.floor(Math.random() * near.length)]);
                } else {
                    const kills = this.stories.climax_kill;
                    this.speak(kills[Math.floor(Math.random() * kills.length)]);
                }
            } else {
                const kills = this.stories.kill_in_cemetery;
                this.speak(kills[Math.floor(Math.random() * kills.length)]);
            }
        },

        narrateVictory() {
            const story = this.stories.victory;
            const randomLine = story[Math.floor(Math.random() * story.length)];
            this.speak(randomLine);
        },

        narrateRefuseLook() {
            const story = this.stories.refuse_look;
            const randomLine = story[Math.floor(Math.random() * story.length)];
            this.speak(randomLine);
        }
    };

    window.HalloweenNarration = HalloweenNarration;
})();
