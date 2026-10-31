/**
 * v7.48.0 — Complete City & World Restructure (Black Sword Alexa Style)
 * Proper city layout with market square, gates, shops, tavern, temple
 * Forest with river, proper connections, equipment system
 */
(() => {
    'use strict';

    const restructureWorld = () => {
        if (!window.WorldData || !window.WorldData.locations) {
            setTimeout(restructureWorld, 100);
            return;
        }

        const W = window.WorldData;

        // Clear existing city locations and rebuild properly
        // ===== KALIWASCH CITY - PROPER LAYOUT =====
        
        // Market Square (CENTER of city)
        W.locations['market_square'] = {
            name: 'Market Square',
            region: 'Kaliwasch City',
            description: 'The bustling heart of Kaliwasch. Merchants shout, customers browse. Streets lead in all directions.',
            exits: { 
                north: 'market_north', 
                south: 'market_south', 
                east: 'tavern_entrance', 
                west: 'provisions_shop' 
            },
            features: ['city', 'market', 'urban'],
            items: [],
            enemies: [],
            safe: true,
            music: 'town'
        };

        // North from Market - Market area
        W.locations['market_north'] = {
            name: 'North Market',
            region: 'Kaliwasch City',
            description: 'More stalls and merchants. The North Gate is ahead.',
            exits: { 
                north: 'north_gate', 
                south: 'market_square',
                east: 'guild_hall',
                west: 'temple'
            },
            features: ['city', 'market'],
            items: [],
            enemies: [],
            safe: true
        };

        // South from Market
        W.locations['market_south'] = {
            name: 'South Market',
            region: 'Kaliwasch City',
            description: 'Southern bazaars. The South Gate lies ahead.',
            exits: { 
                north: 'market_square', 
                south: 'south_gate',
                east: 'house_1',
                west: 'house_2'
            },
            features: ['city', 'market'],
            items: [],
            enemies: [],
            safe: true
        };

        // North Gate
        W.locations['north_gate'] = {
            name: 'North Gate',
            region: 'Kaliwasch City',
            description: 'The northern entrance to Kaliwasch. Beyond lies the forest.',
            exits: { 
                south: 'market_north', 
                north: 'forest_woodland_1'
            },
            features: ['city', 'gate'],
            items: [],
            enemies: [],
            safe: true
        };

        // South Gate
        W.locations['south_gate'] = {
            name: 'South Gate',
            region: 'Kaliwasch City',
            description: 'The southern gate. The forest stretches beyond.',
            exits: { 
                north: 'market_south', 
                south: 'forest_woodland_1'
            },
            features: ['city', 'gate'],
            items: [],
            enemies: [],
            safe: true
        };

        // East Gate (from tavern area)
        W.locations['east_gate'] = {
            name: 'East Gate',
            region: 'Kaliwasch City',
            description: 'Eastern entrance. Forest paths await.',
            exits: { 
                west: 'tavern_entrance', 
                east: 'forest_woodland_1'
            },
            features: ['city', 'gate'],
            items: [],
            enemies: [],
            safe: true
        };

        // West Gate (from shop area)
        W.locations['west_gate'] = {
            name: 'West Gate',
            region: 'Kaliwasch City',
            description: 'Western gate. The forest begins here.',
            exits: { 
                east: 'provisions_shop', 
                west: 'forest_woodland_1'
            },
            features: ['city', 'gate'],
            items: [],
            enemies: [],
            safe: true
        };

        // Provisions Shop (West from Market)
        W.locations['provisions_shop'] = {
            name: 'Provisions Shop',
            region: 'Kaliwasch City',
            description: 'A well-stocked shop. Weapons, armor, potions for sale.',
            exits: { 
                east: 'market_square', 
                west: 'west_gate',
                north: 'house_3'
            },
            features: ['city', 'shop'],
            shop: 'provisions',
            items: ['health_potion', 'mana_potion', 'iron_sword'],
            enemies: [],
            safe: true
        };

        // Tavern (East from Market)
        W.locations['tavern_entrance'] = {
            name: 'The Rusty Tankard Tavern',
            region: 'Kaliwasch City',
            description: 'A lively tavern. Adventurers share tales over drinks.',
            exits: { 
                west: 'market_square', 
                east: 'east_gate',
                north: 'house_4'
            },
            features: ['city', 'tavern'],
            items: [],
            enemies: [],
            safe: true
        };

        // Guild Hall (East from North Market)
        W.locations['guild_hall'] = {
            name: 'Adventurers Guild',
            region: 'Kaliwasch City',
            description: 'Quest board on the wall. Guild masters offer training.',
            exits: { 
                west: 'market_north',
                up: 'guild_training_room'
            },
            features: ['city', 'guild'],
            items: [],
            enemies: [],
            safe: true
        };

        // Temple (West from North Market)
        W.locations['temple'] = {
            name: 'Temple of Auralis',
            region: 'Kaliwasch City',
            description: 'A sacred place. Healers tend to the wounded.',
            exits: { 
                east: 'market_north'
            },
            features: ['city', 'temple'],
            items: [],
            enemies: [],
            safe: true
        };

        // Cemetery (IN CITY - accessible from temple area)
        W.locations['city_cemetery'] = {
            name: 'City Cemetery',
            region: 'Kaliwasch City',
            description: 'Ancient graves. Fog clings to the ground. Halloween spirits stir.',
            exits: { 
                south: 'temple',
                north: 'cemetery_section_2'
            },
            features: ['city', 'cemetery', 'graveyard'],
            items: [],
            enemies: ['skeleton', 'zombie', 'ghost'],
            safe: false,
            music: 'cemetery'
        };

        // Cemetery sections
        for (let i = 2; i <= 8; i++) {
            W.locations[`cemetery_section_${i}`] = {
                name: `Cemetery Section ${i}`,
                region: 'Kaliwasch City',
                description: `Deeper in the cemetery. ${i >= 6 ? 'The spirits grow restless.' : 'Gravestones lean at odd angles.'}`,
                exits: i < 8 ? { 
                    north: `cemetery_section_${i+1}`,
                    south: i === 2 ? 'city_cemetery' : `cemetery_section_${i-1}`
                } : { south: `cemetery_section_${i-1}` },
                features: ['cemetery', 'graveyard'],
                items: i % 3 === 0 ? ['lantern_fragment'] : [],
                enemies: ['skeleton', 'zombie', 'ghost', 'wraith'],
                safe: false,
                music: 'cemetery'
            };
        }

        // ===== FOREST - PROPER STRUCTURE =====
        // Forest starts from any gate
        for (let i = 1; i <= 30; i++) {
            const id = `forest_woodland_${i}`;
            const names = [
                'Woodland Edge', 'Mossy Path', 'Twisted Oaks', 'Fern Hollow', 'Deer Crossing',
                'Old Growth', 'Sunlit Clearing', 'Shadow Glen', 'Mushroom Circle', 'Babbling Brook',
                'Fallen Log Bridge', 'Thorn Thicket', 'Bird Song Meadow', 'Ancient Stump', 'Root Tangle',
                'Mist Valley', 'Wolf Den Approach', 'Eagle Nest View', 'Berry Patch', 'Hollow Tree',
                'Stream Crossing', 'Rocky Outcrop', 'Wildflower Field', 'Dark Canopy', 'Forest Heart',
                'Deep Woods', 'Ancient Grove', 'Whispering Pines', 'Moonlit Glade', 'Forest Core'
            ];
            
            const exits = {};
            
            // Create proper grid-like connections
            // Most locations have N/S/E/W
            // River blocks north at certain points
            if (i <= 3 || (i > 5 && i < 20) || i > 22) {
                exits.north = `forest_woodland_${i-1}`; // North goes to previous
            }
            if (i < 30) {
                exits.south = `forest_woodland_${i+1}`; // South goes to next
            }
            if (i % 5 !== 0 && i % 5 !== 1) {
                exits.east = `forest_path_east_${i}`; // East branches
            }
            if (i % 5 !== 1 && i % 5 !== 0) {
                exits.west = `forest_path_west_${i}`; // West branches
            }
            
            // River at location 8 (after going south from gate 3 times, then west 5 times)
            const isRiver = (i === 8 || i === 13 || i === 18);
            
            W.locations[id] = {
                name: names[i-1] || `Forest Path ${i}`,
                region: 'Great Forest',
                description: isRiver 
                    ? 'A river flows here. The water rushes past. You cannot cross heading north. Go south to find a crossing.' 
                    : `Part of the vast forest. ${i <= 10 ? 'The trees are thick here.' : i <= 20 ? 'You can barely see the sky.' : 'You feel closer to the heart of the forest.'}`,
                exits,
                features: isRiver ? ['forest', 'water', 'river'] : ['forest'],
                items: i % 5 === 0 ? ['health_potion'] : [],
                enemies: isRiver ? [] : (i % 3 === 0 ? ['wolf', 'forest_spider', 'goblin'] : []),
                safe: i === 1 || i === 30,
                hasRiver: isRiver,
                canFish: isRiver
            };
        }

        // ===== EQUIPMENT SYSTEM =====
        const G = window.Game;
        if (G && G.state && G.state.player) {
            if (!G.state.player.equipment) {
                G.state.player.equipment = {
                    rightHand: null,
                    leftHand: null,
                    head: null,
                    face: null,
                    body: null,
                    hands: null,
                    feet: null,
                    accessory: null
                };
            }
        }

        // Override showInventory to include equipment
        if (G) {
            const oldShowInventory = G.showInventory;
            G.showInventory = function() {
                const panel = document.getElementById('inventory-panel');
                const list = document.getElementById('inv-list');
                list.innerHTML = '';
                
                // Show equipment first
                const equip = this.state.player.equipment || {};
                let equipHTML = '<h3>Equipment</h3>';
                equipHTML += `<div class="equip-slot"><strong>Right Hand:</strong> ${equip.rightHand || 'Nothing'}</div>`;
                equipHTML += `<div class="equip-slot"><strong>Left Hand:</strong> ${equip.leftHand || 'Nothing'}</div>`;
                equipHTML += `<div class="equip-slot"><strong>Head:</strong> ${equip.head || 'Nothing'}</div>`;
                equipHTML += `<div class="equip-slot"><strong>Face:</strong> ${equip.face || 'Nothing'}</div>`;
                equipHTML += `<div class="equip-slot"><strong>Body:</strong> ${equip.body || 'Nothing'}</div>`;
                equipHTML += `<div class="equip-slot"><strong>Hands:</strong> ${equip.hands || 'Nothing'}</div>`;
                equipHTML += `<div class="equip-slot"><strong>Feet:</strong> ${equip.feet || 'Nothing'}</div>`;
                equipHTML += `<div class="equip-slot"><strong>Accessory:</strong> ${equip.accessory || 'Nothing'}</div>`;
                
                equipHTML += '<h3>Inventory</h3>';
                
                if (this.state.inventory.length === 0) {
                    equipHTML += '<p class="system">Your bag is empty.</p>';
                    this.addNarrative('Your bag is empty.', 'system');
                } else {
                    const spoken = this.state.inventory.map(i => `${i.name} times ${i.quantity}`).join('; ');
                    this.addNarrative(`In your bag: ${spoken}.`, 'item');
                    
                    this.state.inventory.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'inv-item';
                        const canEquip = ['weapon','armor','helmet','gloves','boots','accessory'].includes(item.type);
                        const canEat = item.type === 'food' || item.effect === 'hunger';
                        const canUse = ['heal','mana','both'].includes(item.effect);
                        const safeName = this.escapeHTML(this.escapeJS(item.name));
                        const primary = canEquip
                            ? `<button onclick="Game.equipItem('${safeName}')">Equip</button>`
                            : canEat ? `<button onclick="Game.useItem('${safeName}')">Eat</button>`
                            : canUse ? `<button onclick="Game.useItem('${safeName}')">Use</button>` : '';
                        div.innerHTML = `<span>${this.escapeHTML(item.name)} <small>${this.escapeHTML(item.type || 'item')}</small></span>`
                            + `<span>x${item.quantity} ${primary}`
                            + `<button onclick="Game.sellItem('${safeName}')">Sell</button>`
                            + `<button onclick="Game.examineInventoryItem('${safeName}')">Examine</button></span>`;
                        list.appendChild(div);
                    });
                }
                
                list.innerHTML = equipHTML + list.innerHTML;
                panel.classList.remove('hidden');
                
                window.AudioManager?.playVoice?.(`Inventory opened. Equipment: ${equip.rightHand || 'nothing'} in right hand. ${this.state.inventory.length} items in bag.`, { channel: 'system' });
            };
        }

        // Add river sound effect
        if (G) {
            const oldEnterLocation = G.enterLocation;
            G.enterLocation = function(id, alreadyVisited) {
                const result = oldEnterLocation.call(this, id, alreadyVisited);
                const loc = W.locations[id];
                
                // Play river sound if at river
                if (loc?.hasRiver) {
                    this.addNarrative('🌊 You hear the river flowing. You can fish here if you have a fishing rod.', 'system');
                    window.AudioManager?.playSFX?.('water');
                }
                
                return result;
            };
        }

        console.log('World restructured: Proper city layout, forest with river, equipment system');
    };

    restructureWorld();
})();
