/* Black Soul Ultimate — hunger, recovery, prayer, blessings and palace quests,
 * decided by the game server.
 *
 * The server keeps the clock and the records; this file shows the results and
 * applies them to the hero. If the server cannot be reached, the same rules run
 * on this device so the game stays playable, and the records are sent to the
 * server the next time it answers.
 */
(function () {
    'use strict';
    const N = window.Narration, S = window.BSUServer;
    if (!N || !S) return;

    N.add({
        'time.minutes': ['{n} minutes', '{n} నిమిషాలు', '{n} मिनट'],
        'time.hours': ['{n} hours', '{n} గంటలు', '{n} घंटे'],
        'hunger.since': ['It has been about {hours} hours since your last meal.', 'మీరు చివరిసారి భోజనం చేసి సుమారు {hours} గంటలు అయింది.', 'आपको पिछला भोजन किए लगभग {hours} घंटे हो गए हैं।'],
        'hunger.starving': ['You are starving. Your strength is failing. Eat a meal now.', 'మీరు ఆకలితో అలమటిస్తున్నారు. మీ బలం తగ్గిపోతోంది. వెంటనే భోజనం చేయండి.', 'आप भूख से बेहाल हैं। आपकी ताकत घट रही है। अभी भोजन करें।'],
        'hunger.weak': ['You are hungry and growing weak. Your strength is reduced. Eat a meal soon.', 'మీకు ఆకలిగా ఉంది, నీరసం పెరుగుతోంది. మీ బలం తగ్గింది. త్వరగా భోజనం చేయండి.', 'आपको भूख लगी है और कमज़ोरी बढ़ रही है। आपकी ताकत घट गई है। जल्दी भोजन करें।'],
        'hunger.hungry': ['You are hungry. Eat a meal to keep your strength.', 'మీకు ఆకలిగా ఉంది. బలం నిలుపుకోవడానికి భోజనం చేయండి.', 'आपको भूख लगी है। ताकत बनाए रखने के लिए भोजन करें।'],
        'hunger.full': ['You are full.', 'మీ కడుపు నిండుగా ఉంది.', 'आपका पेट भरा है।'],
        'hunger.fine': ['You are not hungry.', 'మీకు ఆకలిగా లేదు.', 'आपको भूख नहीं है।'],
        'eat.healed': ['Recovered {hp} HP.', '{hp} ఆరోగ్య పాయింట్లు తిరిగి వచ్చాయి.', '{hp} स्वास्थ्य अंक वापस मिले।'],
        'eat.ate': ['You eat {item}.', 'మీరు {item} తిన్నారు.', 'आपने {item} खाया।'],
        'eat.meal': ['A proper meal. You will not be hungry for about {hours} hours.', 'ఇది కడుపు నిండే భోజనం. సుమారు {hours} గంటల వరకు మీకు ఆకలి వేయదు.', 'यह भरपेट भोजन था। लगभग {hours} घंटे तक आपको भूख नहीं लगेगी।'],
        'eat.snack': ['That takes the edge off your hunger.', 'దీనితో ఆకలి కొంత తగ్గింది.', 'इससे भूख कुछ कम हुई।'],
        'eat.stillHungry': ['It helps a little, but you are still hungry.', 'కొంచెం ఉపశమనం కలిగింది, కానీ ఇంకా ఆకలిగానే ఉంది.', 'थोड़ी राहत मिली, पर आपको अब भी भूख है।'],
        'eat.full': ['You are already full. Keep the {item} for later.', 'మీ కడుపు ఇప్పటికే నిండుగా ఉంది. {item} తర్వాత కోసం ఉంచుకోండి.', 'आपका पेट पहले से भरा है। {item} बाद के लिए रखें।'],
        'regen.away': ['While you were away for {time}, you recovered {hp} health and {mp} magic.', 'మీరు {time} పాటు దూరంగా ఉన్నప్పుడు, {hp} ఆరోగ్యం, {mp} మంత్రశక్తి తిరిగి వచ్చాయి.', 'आप {time} दूर रहे; इस बीच {hp} स्वास्थ्य और {mp} जादुई शक्ति लौट आई।'],

        'bless.strength': ['strength', 'బలం', 'शक्ति'], 'bless.dexterity': ['dexterity', 'చురుకుదనం', 'फुर्ती'],
        'bless.intelligence': ['intelligence', 'బుద్ధి', 'बुद्धि'], 'bless.wisdom': ['wisdom', 'వివేకం', 'विवेक'],
        'bless.health': ['health', 'ఆరోగ్యం', 'स्वास्थ्य'], 'bless.magic': ['magic', 'మంత్రశక్తి', 'जादुई शक्ति'], 'bless.guard': ['protection', 'రక్షణ', 'रक्षा'],
        'prayer.hardship': ['strength in hardship', 'కష్టాల్లో ధైర్యం', 'कठिनाई में सहारा'], 'prayer.healing': ['healing', 'స్వస్థత', 'आरोग्य'],
        'prayer.guidance': ['guidance', 'మార్గదర్శనం', 'मार्गदर्शन'], 'prayer.protection': ['protection', 'రక్షణ', 'रक्षा'],
        'prayer.loved_ones': ['loved ones', 'ప్రియమైనవారు', 'प्रियजन'], 'prayer.gratitude': ['gratitude', 'కృతజ్ఞత', 'कृतज्ञता'],
        'prayer.forgiveness': ['forgiveness', 'క్షమాపణ', 'क्षमा'], 'prayer.courage': ['courage', 'ధైర్యం', 'साहस'],
        'pray.notHere': ['Prayer is offered inside a temple. Go to a temple first. Say temple to travel to the Grand Temple.', 'ప్రార్థన దేవాలయం లోపల చేయాలి. ముందుగా దేవాలయానికి వెళ్లండి. మహా దేవాలయానికి వెళ్లడానికి టెంపుల్ అనండి.', 'प्रार्थना मंदिर के भीतर की जाती है। पहले मंदिर जाएँ। महा मंदिर जाने के लिए टेंपल कहें।'],
        'pray.choose': ['What would you like to pray about? Choose one: {list}.', 'మీరు దేని గురించి ప్రార్థించాలనుకుంటున్నారు? ఒకటి ఎంచుకోండి: {list}.', 'आप किस बात के लिए प्रार्थना करना चाहते हैं? एक चुनें: {list}।'],
        'pray.text.hardship': ['You kneel and speak honestly of the hard road you are walking. You ask for the strength to carry it one more day.', 'మీరు మోకరిల్లి, మీరు నడుస్తున్న కఠినమైన దారి గురించి నిజాయితీగా చెప్పుకున్నారు. దానిని మరో రోజు మోయగల బలం ఇవ్వమని వేడుకున్నారు.', 'आप घुटने टेककर अपने कठिन रास्ते की बात सच्चे मन से कहते हैं। आप उसे एक और दिन सहने की शक्ति माँगते हैं।'],
        'pray.text.healing': ['You pray for healing, for yourself and for everyone who is in pain today.', 'మీ కోసం, ఈ రోజు బాధలో ఉన్న ప్రతి ఒక్కరి కోసం స్వస్థత కలగాలని ప్రార్థించారు.', 'आप अपने लिए और आज पीड़ा में पड़े हर व्यक्ति के लिए आरोग्य की प्रार्थना करते हैं।'],
        'pray.text.guidance': ['You ask to be shown the right path when the way ahead is unclear.', 'ముందున్న దారి స్పష్టంగా లేనప్పుడు సరైన మార్గం చూపమని వేడుకున్నారు.', 'आप प्रार्थना करते हैं कि जब आगे का रास्ता साफ़ न हो, तब सही मार्ग दिखाया जाए।'],
        'pray.text.protection': ['You ask for protection over your journey and over all who travel with you.', 'మీ ప్రయాణానికి, మీతో ప్రయాణించే వారందరికీ రక్షణ కలగాలని వేడుకున్నారు.', 'आप अपनी यात्रा और अपने साथ चलने वालों की रक्षा के लिए प्रार्थना करते हैं।'],
        'pray.text.loved_ones': ['You hold the people you love in your thoughts, near and far, and ask that they be kept safe and well.', 'దగ్గర ఉన్నా, దూరంగా ఉన్నా మీరు ప్రేమించే వారిని తలచుకుని, వారు క్షేమంగా ఉండాలని వేడుకున్నారు.', 'आप अपने प्रियजनों को याद करते हैं, पास हों या दूर, और उनके कुशल-मंगल की प्रार्थना करते हैं।'],
        'pray.text.gratitude': ['You give thanks: for this day, for food, for friends, and for the breath in your body.', 'ఈ రోజు కోసం, ఆహారం కోసం, స్నేహితుల కోసం, మీలోని ఊపిరి కోసం కృతజ్ఞతలు తెలిపారు.', 'आप धन्यवाद देते हैं: इस दिन के लिए, भोजन के लिए, मित्रों के लिए, और अपनी साँसों के लिए।'],
        'pray.text.forgiveness': ['You ask forgiveness for the wrongs you have done, and for the grace to forgive those who have wronged you.', 'మీరు చేసిన తప్పులకు క్షమాపణ కోరారు; మీకు అన్యాయం చేసిన వారిని క్షమించగల మనసు ఇవ్వమని వేడుకున్నారు.', 'आप अपनी भूलों के लिए क्षमा माँगते हैं, और उन लोगों को क्षमा करने की शक्ति भी जिन्होंने आपके साथ गलत किया।'],
        'pray.text.courage': ['You ask for courage to face what frightens you, and to do what is right even when it is hard.', 'మిమ్మల్ని భయపెట్టే వాటిని ఎదుర్కొనే ధైర్యం, కష్టమైనా సరైనదే చేసే ధైర్యం ఇవ్వమని వేడుకున్నారు.', 'आप उस साहस की प्रार्थना करते हैं जिससे डर का सामना कर सकें और कठिन होने पर भी सही काम कर सकें।'],
        'pray.daily': ['Your prayer is received. A blessing of {blessing} will stand with you in battle until this time tomorrow. Your health and magic are restored.', 'మీ ప్రార్థన స్వీకరించబడింది. {blessing} ఆశీర్వాదం రేపు ఇదే సమయం వరకు యుద్ధంలో మీకు తోడుంటుంది. మీ ఆరోగ్యం, మంత్రశక్తి పూర్తిగా తిరిగి వచ్చాయి.', 'आपकी प्रार्थना स्वीकार हुई। {blessing} का आशीर्वाद कल इसी समय तक युद्ध में आपके साथ रहेगा। आपका स्वास्थ्य और जादुई शक्ति पूरी हो गई है।'],
        'pray.already': ['Your prayer is heard. Today\'s blessing of {blessing} is already with you, and a new one can be received in about {hours} hours. Prayer does not restore health or magic again today.', 'మీ ప్రార్థన ఆలకించబడింది. ఈ రోజు {blessing} ఆశీర్వాదం ఇప్పటికే మీతో ఉంది; కొత్త ఆశీర్వాదం సుమారు {hours} గంటల తర్వాత లభిస్తుంది. ఈ రోజు ప్రార్థన మళ్లీ ఆరోగ్యాన్ని లేదా మంత్రశక్తిని తిరిగి ఇవ్వదు.', 'आपकी प्रार्थना सुन ली गई। आज का {blessing} का आशीर्वाद पहले से आपके साथ है; नया आशीर्वाद लगभग {hours} घंटे बाद मिल सकेगा। आज प्रार्थना से स्वास्थ्य या जादुई शक्ति दोबारा नहीं लौटेगी।'],
        'pray.firstOffer': ['Because this is your first prayer, you may receive one lasting blessing that stays with this hero for life. Choose one: {list}.', 'ఇది మీ మొదటి ప్రార్థన కాబట్టి, ఈ వీరునికి జీవితాంతం తోడుండే ఒక శాశ్వత ఆశీర్వాదం పొందవచ్చు. ఒకటి ఎంచుకోండి: {list}.', 'यह आपकी पहली प्रार्थना है, इसलिए आप एक स्थायी आशीर्वाद पा सकते हैं जो इस नायक के साथ जीवन भर रहेगा। एक चुनें: {list}।'],
        'pray.permanentPending': ['Your lasting blessing is still waiting to be chosen. Choose one: {list}.', 'మీ శాశ్వత ఆశీర్వాదం ఇంకా ఎంచుకోవలసి ఉంది. ఒకటి ఎంచుకోండి: {list}.', 'आपका स्थायी आशीर्वाद चुनना अभी बाकी है। एक चुनें: {list}।'],
        'pray.permanentGranted': ['You receive the lasting blessing of {choice}: {effect}. It stays with this hero for life and cannot be chosen again.', 'మీకు {choice} శాశ్వత ఆశీర్వాదం లభించింది: {effect}. ఇది ఈ వీరునితో జీవితాంతం ఉంటుంది; మళ్లీ ఎంచుకోలేరు.', 'आपको {choice} का स्थायी आशीर्वाद मिला: {effect}। यह इस नायक के साथ जीवन भर रहेगा और दोबारा नहीं चुना जा सकता।'],
        'pray.permanentAlready': ['This hero already carries the lasting blessing of {choice}. It is given only once.', 'ఈ వీరుని వద్ద ఇప్పటికే {choice} శాశ్వత ఆశీర్వాదం ఉంది. అది ఒక్కసారి మాత్రమే లభిస్తుంది.', 'इस नायक के पास पहले से {choice} का स्थायी आशीर्वाद है। यह केवल एक बार मिलता है।'],
        'pray.prayFirst': ['Offer a prayer first. The lasting blessing follows your first prayer.', 'ముందుగా ప్రార్థన చేయండి. మొదటి ప్రార్థన తర్వాత శాశ్వత ఆశీర్వాదం లభిస్తుంది.', 'पहले प्रार्थना करें। स्थायी आशीर्वाद पहली प्रार्थना के बाद मिलता है।'],
        'pray.effect.stat': ['plus 3 {choice}', '{choice} 3 పెరిగింది', '{choice} में 3 की बढ़ोतरी'],
        'pray.effect.health': ['plus 15 maximum health', 'గరిష్ఠ ఆరోగ్యం 15 పెరిగింది', 'अधिकतम स्वास्थ्य में 15 की बढ़ोतरी'],
        'pray.effect.magic': ['plus 15 maximum magic', 'గరిష్ఠ మంత్రశక్తి 15 పెరిగింది', 'अधिकतम जादुई शक्ति में 15 की बढ़ोतरी'],
        'pray.busy': ['One moment. Your prayer is still being received.', 'ఒక్క క్షణం. మీ ప్రార్థన ఇంకా స్వీకరించబడుతోంది.', 'एक क्षण। आपकी प्रार्थना अभी स्वीकार की जा रही है।'],
        'temple.heal': ['The temple restores your health and magic once a day, together with your daily blessing. At other times, rest, eat, or use healing magic.', 'దేవాలయం రోజుకు ఒకసారి, మీ రోజువారీ ఆశీర్వాదంతో పాటు ఆరోగ్యాన్ని, మంత్రశక్తిని తిరిగి ఇస్తుంది. మిగతా సమయాల్లో విశ్రాంతి తీసుకోండి, భోజనం చేయండి, లేదా స్వస్థత మంత్రం వాడండి.', 'मंदिर दिन में एक बार, आपके दैनिक आशीर्वाद के साथ, स्वास्थ्य और जादुई शक्ति लौटाता है। बाकी समय आराम करें, भोजन करें, या उपचार मंत्र का प्रयोग करें।'],
        'btn.pray': ['Pray', 'ప్రార్థించు', 'प्रार्थना करें'], 'btn.lasting': ['Choose Lasting Blessing', 'శాశ్వత ఆశీర్వాదం ఎంచుకోండి', 'स्थायी आशीर्वाद चुनें'], 'btn.palaceQuest': ['Palace Quest', 'రాజభవన కార్యం', 'राजमहल का कार्य'],

        'quest.notHere': ['Go to the Royal Palace first. Say palace.', 'ముందుగా రాజభవనానికి వెళ్లండి. ప్యాలెస్ అనండి.', 'पहले राजमहल जाएँ। पैलेस कहें।'],
        'quest.accepted': ['The Royal Court gives you the quest {name}. {desc} {companion}, {title}, joins you and will fight beside you until the quest is done. Reward: {xp} experience and {gold} rupees.', 'రాజసభ మీకు {name} కార్యాన్ని అప్పగించింది. {desc} {companion} ({title}) మీతో చేరారు; కార్యం పూర్తయ్యే వరకు మీ పక్కన పోరాడతారు. బహుమతి: {xp} అనుభవం, {gold} రూపాయలు.', 'राजसभा ने आपको {name} का कार्य सौंपा है। {desc} {companion} ({title}) आपके साथ जुड़ गए हैं और कार्य पूरा होने तक आपके साथ लड़ेंगे। पुरस्कार: {xp} अनुभव और {gold} रुपये।'],
        'quest.active': ['You are on the quest {name}: {progress} of {target} battles won. {companion} is travelling with you.', 'మీరు {name} కార్యంలో ఉన్నారు: {target} లో {progress} పోరాటాలు గెలిచారు. {companion} మీతో ప్రయాణిస్తున్నారు.', 'आप {name} के कार्य पर हैं: {target} में से {progress} लड़ाइयाँ जीत चुके हैं। {companion} आपके साथ हैं।'],
        'quest.progress': ['{name}: {progress} of {target} battles won.', '{name}: {target} లో {progress} పోరాటాలు గెలిచారు.', '{name}: {target} में से {progress} लड़ाइयाँ जीतीं।'],
        'quest.routeStep': ['Next exit: {direction} to {room}. Open Quests again after moving for the next step.', 'తదుపరి దారి: {direction}, {room} వైపు. కదిలిన తర్వాత తదుపరి అడుగు కోసం కార్యాల జాబితా మళ్లీ తెరవండి.', 'अगला रास्ता: {direction}, {room} की ओर। चलने के बाद अगला कदम जानने के लिए कार्य सूची फिर खोलें।'],
        'quest.routeHere': ['You are at the court. Choose {action} in Location actions to report your victory.', 'మీరు రాజసభలో ఉన్నారు. విజయాన్ని నివేదించడానికి ఇక్కడి చర్యలలో {action} ఎంచుకోండి.', 'आप राजदरबार में हैं। जीत की सूचना देने के लिए यहाँ की कार्रवाइयों में {action} चुनें।'],
        'quest.routeMissing': ['No open route to the court was found from here. Check the available exits and doors, then open Quests again.', 'ఇక్కడి నుంచి రాజసభకు తెరిచిన దారి కనబడలేదు. దారులు, తలుపులు చూసి కార్యాల జాబితా మళ్లీ తెరవండి.', 'यहाँ से दरबार तक कोई खुला रास्ता नहीं मिला। निकास और दरवाज़े जाँचें, फिर कार्य सूची खोलें।'],
        'quest.finalVictory': ['Final battle won for {name}. Reward not collected yet. {guide}', '{name} కోసం చివరి పోరులో గెలిచారు. బహుమతి ఇంకా అందలేదు. {guide}', '{name} की आखिरी लड़ाई जीत ली। अभी इनाम नहीं मिला है। {guide}'],
        'quest.openJournal': ['Open Quests for directions back to the Royal Palace.', 'రాజభవనానికి తిరిగి వెళ్లే దారి కోసం కార్యాల జాబితా తెరవండి.', 'राजमहल लौटने का रास्ता जानने के लिए कार्य सूची खोलें।'],
        'quest.previouslyPaid': ['The court already recorded the reward for {name}. No new reward was added.', '{name} బహుమతి ఇప్పటికే నమోదైంది. కొత్త బహుమతి జోడించలేదు.', '{name} का इनाम दरबार में पहले ही दर्ज है। कोई नया इनाम नहीं जोड़ा गया।'],
        'quest.ready': ['{name} is done: {target} of {target} battles won. Return to the Royal Palace and report to the court for your reward.', '{name} పూర్తయింది: {target} లో {target} పోరాటాలు గెలిచారు. బహుమతి కోసం రాజభవనానికి తిరిగి వెళ్లి రాజసభకు తెలియజేయండి.', '{name} पूरा हुआ: {target} में से {target} लड़ाइयाँ जीतीं। पुरस्कार के लिए राजमहल लौटकर राजसभा को सूचना दें।'],
        'quest.completed': ['The court honours you. {name} is complete. You receive {xp} experience and {gold} rupees. {companion} bows and returns to the palace.', 'రాజసభ మిమ్మల్ని సత్కరించింది. {name} పూర్తయింది. మీకు {xp} అనుభవం, {gold} రూపాయలు లభించాయి. {companion} నమస్కరించి రాజభవనానికి తిరిగి వెళ్లారు.', 'राजसभा ने आपका सम्मान किया। {name} पूरा हुआ। आपको {xp} अनुभव और {gold} रुपये मिले। {companion} प्रणाम करके राजमहल लौट गए।'],
        'quest.allDone': ['You have completed every quest the Royal Court has to give. The Crown\'s thanks go with you.', 'రాజసభ ఇవ్వగల ప్రతి కార్యాన్నీ మీరు పూర్తి చేశారు. రాజ్యం మీకు కృతజ్ఞతలు తెలుపుతోంది.', 'आपने राजसभा का हर कार्य पूरा कर लिया है। राज्य आपका आभारी है।'],
        'quest.rejoin': ['{companion} has recovered and rejoins you for the quest.', '{companion} కోలుకుని, కార్యం కోసం మళ్లీ మీతో చేరారు.', '{companion} ठीक होकर कार्य के लिए फिर आपके साथ आ गए हैं।'],
        'quest.busy': ['One moment. The court is still recording your quest.', 'ఒక్క క్షణం. రాజసభ మీ కార్యాన్ని ఇంకా నమోదు చేస్తోంది.', 'एक क्षण। राजसभा अभी आपका कार्य दर्ज कर रही है।'],
        'quest.name.royal_hunt': ['Royal Forest Hunt', 'రాజ అటవీ వేట', 'राजकीय वन आखेट'],
        'quest.name.palace_healers_road': ['The Healer\'s Road', 'వైద్యురాలి దారి', 'वैद्य का मार्ग'],
        'quest.name.palace_border_watch': ['Border Watch', 'సరిహద్దు కాపలా', 'सीमा पहरा'],
        'quest.name.palace_scholars_errand': ['The Scholar\'s Errand', 'పండితురాలి పని', 'विदुषी का कार्य'],
        'quest.name.palace_kings_champion': ['The King\'s Champion', 'రాజు యోధుడు', 'राजा का योद्धा'],
        'quest.desc.royal_hunt': ['Defeat five monsters for the Crown.', 'రాజ్యం కోసం ఐదు రాక్షసులను ఓడించండి.', 'राज्य के लिए पाँच राक्षसों को हराएँ।'],
        'quest.desc.palace_healers_road': ['Defeat eight monsters threatening the pilgrim road while you escort the palace healer.', 'రాజభవన వైద్యురాలికి తోడుగా ఉంటూ, యాత్రికుల దారిని బెదిరిస్తున్న ఎనిమిది రాక్షసులను ఓడించండి.', 'राजमहल की वैद्य के साथ रहते हुए तीर्थ मार्ग को डराने वाले आठ राक्षसों को हराएँ।'],
        'quest.desc.palace_border_watch': ['Clear twelve monsters from the kingdom\'s borders with the captain of the watch.', 'కాపలా దళ నాయకునితో కలిసి రాజ్య సరిహద్దుల నుండి పన్నెండు రాక్షసులను తరిమివేయండి.', 'पहरे के कप्तान के साथ राज्य की सीमाओं से बारह राक्षसों का सफ़ाया करें।'],
        'quest.desc.palace_scholars_errand': ['Protect the court scholar through fifteen battles while she studies the creatures of the wild.', 'అడవి జీవులను అధ్యయనం చేస్తున్న రాజసభ పండితురాలిని పదిహేను పోరాటాల పాటు కాపాడండి.', 'जंगल के जीवों का अध्ययन कर रही राजसभा की विदुषी की पंद्रह लड़ाइयों तक रक्षा करें।'],
        'quest.desc.palace_kings_champion': ['Win twenty battles beside the King\'s own champion.', 'రాజు యోధునితో కలిసి ఇరవై పోరాటాలు గెలవండి.', 'राजा के अपने योद्धा के साथ बीस लड़ाइयाँ जीतें।']
    });

    const PRAYERS = { hardship: 'strength', healing: 'guard', guidance: 'wisdom', protection: 'guard', loved_ones: 'intelligence', gratitude: 'intelligence', forgiveness: 'wisdom', courage: 'dexterity' };
    const PRAYER_ALIASES = { hard: 'hardship', hardship: 'hardship', struggle: 'hardship', trouble: 'hardship', heal: 'healing', healing: 'healing', health: 'healing', guide: 'guidance', guidance: 'guidance', path: 'guidance',
        protect: 'protection', protection: 'protection', safety: 'protection', family: 'loved_ones', friends: 'loved_ones', loved: 'loved_ones', 'loved ones': 'loved_ones', loved_ones: 'loved_ones',
        thanks: 'gratitude', thank: 'gratitude', gratitude: 'gratitude', forgive: 'forgiveness', forgiveness: 'forgiveness', courage: 'courage', brave: 'courage', bravery: 'courage', fear: 'courage' };
    const PERMANENT = { strength: 'str', dexterity: 'dex', intelligence: 'int', wisdom: 'wis', health: 'health', magic: 'magic' };
    const PERMANENT_ALIASES = { str: 'strength', strength: 'strength', dex: 'dexterity', dexterity: 'dexterity', int: 'intelligence', intelligence: 'intelligence', wis: 'wisdom', wisdom: 'wisdom', health: 'health', hp: 'health', magic: 'magic', mp: 'magic', 'magic points': 'magic' };
    const DAY = 24 * 3600000;
    /** Same catalog the server holds, used only while the server is unreachable. */
    const CATALOG = [
        { quest_id: 'royal_hunt', target: 5, reward_xp: 250, reward_gold: 180, companion: { id: 'ser_aldric', name: 'Ser Aldric', title: 'Royal Huntsman', role: 'fighter', maxHp: 110, attack: 16, heal: 0 } },
        { quest_id: 'palace_healers_road', target: 8, reward_xp: 380, reward_gold: 260, companion: { id: 'sister_meera', name: 'Sister Meera', title: 'Palace Healer', role: 'healer', maxHp: 85, attack: 8, heal: 14 } },
        { quest_id: 'palace_border_watch', target: 12, reward_xp: 560, reward_gold: 400, companion: { id: 'captain_rudra', name: 'Captain Rudra', title: 'Captain of the Border Watch', role: 'guardian', maxHp: 140, attack: 18, heal: 0 } },
        { quest_id: 'palace_scholars_errand', target: 15, reward_xp: 760, reward_gold: 520, companion: { id: 'scholar_ilavati', name: 'Scholar Ilavati', title: 'Court Scholar', role: 'mage', maxHp: 80, attack: 20, heal: 6 } },
        { quest_id: 'palace_kings_champion', target: 20, reward_xp: 1100, reward_gold: 800, companion: { id: 'veer', name: 'Veer', title: "The King's Champion", role: 'champion', maxHp: 170, attack: 24, heal: 0 } }
    ];
    const catalogEntry = id => CATALOG.find(q => q.quest_id === id);
    const questName = id => N.has('quest.name.' + id) ? N.t('quest.name.' + id) : id;
    const questDesc = id => N.has('quest.desc.' + id) ? N.t('quest.desc.' + id) : '';
    // A temple, or a room marked as a place of prayer (the palace chapel).
    const inTemple = G => G.state.location === 'grand_temple' || /temple$/.test(G.state.location || '') || Boolean(window.WorldData?.locations?.[G.state.location]?.prayerPlace);
    // The King gives and receives palace quests in person as well as at the quest board.
    const QUEST_ROOMS = new Set(['royal_palace', 'kaliwasch_palace_throne_room']);
    const atQuestRoom = G => QUEST_ROOMS.has(G.state.location);
    const say = (G, text, type = 'system', options = {}) => G.emitGameEvent ? G.emitGameEvent(text, type, options) : G.addNarrative(text, type);
    const sacred = G => G.state.sacred || (G.state.sacred = {});
    const palace = G => { const s = sacred(G); if (!s.palace || typeof s.palace !== 'object') s.palace = { active: null, completed: [] }; if (!Array.isArray(s.palace.completed)) s.palace.completed = []; return s.palace; };
    const duration = minutes => minutes >= 90 ? N.t('time.hours', { n: Math.round(minutes / 6) / 10 }) : N.t('time.minutes', { n: minutes });

    function wire() {
        const G = window.Game;
        if (!G || G._survivalV755) return;
        G._survivalV755 = true;
        const Hunger = () => window.ItemHunger;

        // ---------------------------------------------------- hunger and recovery
        function applyServerHunger(view) {
            const p = G.state.player, H = Hunger();
            if (!p || !view.hunger || !H) return;
            if (view.config) {
                if (Number(view.config.hunger_hours) > 0) H.HUNGER.hours = Number(view.config.hunger_hours);
                if (Number.isFinite(Number(view.config.hunger_threshold))) H.HUNGER.threshold = Number(view.config.hunger_threshold);
                if (Number.isFinite(Number(view.config.meal_threshold))) H.HUNGER.meal = Number(view.config.meal_threshold);
            }
            p.satiety = Number(view.hunger.satiety);
            p.satietyAt = Number(view.server_now) || S.now();
            if (view.hunger.last_meal_at) p.lastMealAt = Number(view.hunger.last_meal_at);
            H.hungerTick(G);
        }

        function applyRegen(minutes, { announce = false, perHp = 1, perMp = 1 } = {}) {
            const p = G.state.player;
            if (!p || !(minutes > 0) || p.pendingTempleRevival || p.permadead || p.hp <= 0) return { hp: 0, mp: 0 };
            const hp = Math.max(0, Math.min(Math.floor(minutes * perHp), p.maxHp - p.hp));
            const mp = Math.max(0, Math.min(Math.floor(minutes * perMp), p.maxMp - p.mp));
            p.hp += hp; p.mp += mp;
            // Gradual recovery is silent. Only a real absence is announced, once.
            if (announce && minutes >= 5 && (hp || mp)) say(G, N.t('regen.away', { time: duration(minutes), hp, mp }), 'green-light');
            if (hp || mp) { G.updateHUD?.(); G.save?.(); }
            return { hp, mp };
        }

        const regenState = () => G.state.regeneration = Object.assign({ lastTick: Date.now(), offlinePaid: 0 }, G.state.regeneration || {});

        // Natural recovery used to be worked out from the device clock, so setting
        // the clock forward or reloading healed the hero. Minutes now come from
        // the server. Only when the server is unreachable does the device count,
        // and those minutes are deducted when the server next answers.
        G.applyTimedRegeneration = function (announce = false) {
            const p = this.state.player;
            if (!p) return;
            const r = regenState(), now = Date.now();
            if (S.canCall()) { r.lastTick = now; return; }
            const minutes = Math.min(24 * 60, Math.floor((now - r.lastTick) / 60000));
            if (minutes < 1) { if (now < r.lastTick) r.lastTick = now; return; }
            r.lastTick += minutes * 60000;
            r.offlinePaid = Math.min(24 * 60, (r.offlinePaid || 0) + minutes);
            applyRegen(minutes, { announce });
        };

        S.on((view, args) => {
            if (!view.ok || !G.state.player) return;
            const r = regenState();
            let minutes = Number(view.regen_minutes) || 0;
            if (r.offlinePaid > 0) { const used = Math.min(minutes, r.offlinePaid); minutes -= used; r.offlinePaid = 0; }
            r.lastTick = Date.now();
            applyServerHunger(view);
            applyRegen(minutes, { announce: Boolean(args?.first) || minutes >= 5, perHp: Number(view.config?.hp_per_minute) || 1, perMp: Number(view.config?.mp_per_minute) || 1 });
            syncBlessings(view);
            syncQuests(view);
        });

        window.addEventListener('bsu-ate', async event => {
            if (!S.canCall() || !G.state.player) return;
            const view = await S.call('eat', S.heroArgs({ satiety: event.detail.satiety }));
            if (view.ok && view.hunger) applyServerHunger(view);
        });

        // ---------------------------------------------------- prayer and blessings
        function setDaily(daily) {
            if (!daily || !daily.active) { if (sacred(G).dailyBattleBlessing?.source === 'prayer') sacred(G).dailyBattleBlessing = null; return; }
            // Older combat code compares expiresAt with the device clock.
            const expiresAt = Number(daily.next_at) - (S.state.offset || 0);
            sacred(G).dailyBattleBlessing = { type: daily.battle || daily.blessing, value: 5, expiresAt, source: 'prayer', prayer: daily.prayer };
            sacred(G).lastTemporaryPrayer = Number(daily.granted_at) - (S.state.offset || 0);
        }

        function syncBlessings(view) {
            const b = view.blessings;
            if (!b) return;
            if (!sacred(G).permanentTempleBlessing && (sacred(G).permanentBlessingChoice || sacred(G).permanentBlessingClaimed)) sacred(G).permanentTempleBlessing = sacred(G).permanentBlessingChoice || 'legacy';
            if (b.first_prayer) sacred(G).firstPrayerDone = true;
            if (b.permanent && !sacred(G).permanentTempleBlessing) sacred(G).permanentTempleBlessing = b.permanent;        // recorded already; never granted twice
            else if (!b.permanent && PERMANENT[sacred(G).permanentTempleBlessing] && !sacred(G)._permanentImport) {
                // A blessing chosen before the server existed: record it, grant nothing.
                sacred(G)._permanentImport = true;
                S.call('permanent', S.heroArgs({ choice: sacred(G).permanentTempleBlessing, legacy: true }));
            }
            setDaily(b.daily);
            G.updateContextActions?.();
        }

        const permanentList = () => N.list(Object.keys(PERMANENT).map(c => N.t('bless.' + c)), 'or');
        const prayerList = () => N.list(Object.keys(PRAYERS).map(p => N.t('prayer.' + p)), 'or');

        function grantPermanentLocally(choice) {
            const p = G.state.player, key = PERMANENT[choice];
            if (key === 'health') { p.maxHp += 15; p.hp += 15; }
            else if (key === 'magic') { p.maxMp += 15; p.mp += 15; }
            else p[key] = (Number(p[key]) || 0) + 3;
            sacred(G).permanentTempleBlessing = choice;
            const effect = key === 'health' ? N.t('pray.effect.health') : key === 'magic' ? N.t('pray.effect.magic') : N.t('pray.effect.stat', { choice: N.t('bless.' + choice) });
            say(G, N.t('pray.permanentGranted', { choice: N.t('bless.' + choice), effect }), 'green-light', { sfx: ['heal'] });
            G.updateHUD?.(); G.save?.();
        }

        function showChoices(kind) {
            const box = document.getElementById('context-actions');
            const keys = kind === 'permanent' ? Object.keys(PERMANENT) : Object.keys(PRAYERS);
            const label = key => N.t((kind === 'permanent' ? 'bless.' : 'prayer.') + key);
            if (box) {
                box.innerHTML = '';
                const title = document.createElement('strong');
                title.textContent = kind === 'permanent' ? N.t('btn.lasting') + ':' : N.t('btn.pray') + ':';
                box.appendChild(title);
                for (const key of keys) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.textContent = label(key).replace(/^./, c => c.toUpperCase());
                    button.addEventListener('click', () => kind === 'permanent' ? G.claimPermanentTempleBlessing(key) : G.pray(key));
                    box.appendChild(button);
                }
            }
            say(G, N.t(kind === 'permanent' ? 'pray.permanentPending' : 'pray.choose', { list: kind === 'permanent' ? permanentList() : prayerList() }), 'green-light');
        }

        G.claimPermanentTempleBlessing = async function (choice) {
            choice = PERMANENT_ALIASES[String(choice || '').toLowerCase().trim()];
            if (!inTemple(this)) { say(this, N.t('pray.notHere')); return false; }
            if (sacred(G).permanentTempleBlessing) { say(this, N.t('pray.permanentAlready', { choice: N.has('bless.' + sacred(G).permanentTempleBlessing) ? N.t('bless.' + sacred(G).permanentTempleBlessing) : sacred(G).permanentTempleBlessing })); this.updateContextActions?.(); return false; }
            if (!sacred(G).firstPrayerDone) { say(this, N.t('pray.prayFirst')); showChoices('prayer'); return false; }
            if (!choice) { showChoices('permanent'); return false; }
            if (this._prayerBusy) { say(this, N.t('pray.busy')); return false; }
            if (S.canCall()) {
                this._prayerBusy = true;
                let result;
                try { result = await S.call('permanent', S.heroArgs({ choice })); } finally { this._prayerBusy = false; }
                if (result.ok) {
                    if (result.granted) grantPermanentLocally(choice);
                    else { sacred(G).permanentTempleBlessing = result.blessing || choice; say(this, N.t('pray.permanentAlready', { choice: N.t('bless.' + sacred(G).permanentTempleBlessing) })); }
                    this.updateContextActions?.();
                    return Boolean(result.granted);
                }
                if (result.error === 'pray_first') { say(this, N.t('pray.prayFirst')); return false; }
                if (!['network', 'offline', 'server_error'].includes(result.error)) return false;
            }
            grantPermanentLocally(choice);          // offline: recorded on the server at the next contact
            this.updateContextActions?.();
            return true;
        };

        function finishPrayer(prayer, { first, granted, daily, hoursLeft }) {
            const p = G.state.player;
            sacred(G).firstPrayerDone = true;
            const lines = [N.t('pray.text.' + prayer)];
            if (granted) {
                p.hp = p.maxHp; p.mp = p.maxMp;
                regenState().lastTick = Date.now();
                lines.push(N.t('pray.daily', { blessing: N.t('bless.' + daily) }));
            } else {
                lines.push(N.t('pray.already', { blessing: N.has('bless.' + daily) ? N.t('bless.' + daily) : daily, hours: hoursLeft }));
            }
            say(G, lines.join(' '), 'green-light', { sfx: [granted ? 'heal-chain' : 'magic'] });
            G.updateHUD?.(); G.save?.();
            if (!sacred(G).permanentTempleBlessing) {
                if (first) { say(G, N.t('pray.firstOffer', { list: permanentList() }), 'green-light'); showChoicesQuiet(); }
                else showChoices('permanent');
            } else G.updateContextActions?.();
        }
        function showChoicesQuiet() {
            const box = document.getElementById('context-actions');
            if (!box) return;
            box.innerHTML = '';
            const title = document.createElement('strong');
            title.textContent = N.t('btn.lasting') + ':';
            box.appendChild(title);
            for (const key of Object.keys(PERMANENT)) {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = N.t('bless.' + key).replace(/^./, c => c.toUpperCase());
                button.addEventListener('click', () => G.claimPermanentTempleBlessing(key));
                box.appendChild(button);
            }
        }

        // Replaces every earlier version of prayer. In particular the temple no
        // longer refills health and magic each time the player prays: that
        // happens once, together with the daily blessing the server grants.
        G.pray = async function (choice = '') {
            if (!inTemple(this)) { say(this, N.t('pray.notHere')); return false; }
            if (this.state.player?.pendingTempleRevival) { this.divineRevive(); return true; }
            let word = String(choice || '').toLowerCase().trim().replace(/^(for|about|to)\s+/, '').replace(/^(my|the)\s+/, '');
            if (sacred(G).firstPrayerDone && !sacred(G).permanentTempleBlessing && PERMANENT_ALIASES[word] && !PRAYER_ALIASES[word]) return this.claimPermanentTempleBlessing(word);
            if (sacred(G).firstPrayerDone && !sacred(G).permanentTempleBlessing && PERMANENT_ALIASES[word] && ['health', 'strength', 'wisdom', 'magic', 'dexterity', 'intelligence'].includes(word)) return this.claimPermanentTempleBlessing(word);
            const prayer = PRAYER_ALIASES[word] || (PRAYERS[word] ? word : '');
            if (!prayer) { showChoices('prayer'); return false; }
            if (this._prayerBusy) { say(this, N.t('pray.busy')); return false; }
            if (S.canCall()) {
                this._prayerBusy = true;
                let result;
                try { result = await S.call('pray', S.heroArgs({ prayer })); } finally { this._prayerBusy = false; }
                if (result.ok) {
                    const daily = result.blessings?.daily;
                    setDaily(daily);
                    if (result.blessings?.permanent && !sacred(G).permanentTempleBlessing) sacred(G).permanentTempleBlessing = result.blessings.permanent;
                    const hoursLeft = daily ? Math.max(1, Math.ceil((Number(daily.next_at) - Number(result.server_now)) / 3600000)) : 24;
                    finishPrayer(prayer, { first: Boolean(result.first_prayer), granted: Boolean(result.daily_granted), daily: daily?.battle || PRAYERS[prayer], hoursLeft });
                    return true;
                }
                if (!['network', 'offline', 'server_error'].includes(result.error)) return false;
            }
            // Offline: the same once-a-day rule against this device's clock.
            const now = Date.now(), last = Number(sacred(G).lastTemporaryPrayer) || 0, first = !sacred(G).firstPrayerDone;
            // A blessing that is still standing is itself proof it was granted:
            // a snapshot that kept the blessing but lost its timestamp must not
            // hand out a second one the same day.
            const standing = sacred(G).dailyBattleBlessing
                && (sacred(G).dailyBattleBlessing.source === 'prayer'
                    || (!sacred(G).dailyBattleBlessing.source && Number(sacred(G).dailyBattleBlessing.expiresAt) - now > 3600000))
                && Number(sacred(G).dailyBattleBlessing.expiresAt) > now;
            const granted = !standing && (!last || now - last >= DAY || now < last);
            if (granted) { sacred(G).lastTemporaryPrayer = now; sacred(G).dailyBattleBlessing = { type: PRAYERS[prayer], value: 5, expiresAt: now + DAY, source: 'prayer', prayer }; }
            finishPrayer(prayer, { first, granted, daily: sacred(G).dailyBattleBlessing?.type || PRAYERS[prayer], hoursLeft: Math.max(1, Math.ceil((DAY - (now - last)) / 3600000)) });
            return true;
        };
        G.isPrayerPlace = function () { return inTemple(this); };
        G.showPrayerChoices = function () { if (sacred(G).firstPrayerDone && !sacred(G).permanentTempleBlessing) showChoices('permanent'); else showChoices('prayer'); };
        G.claimDailyTempleBlessing = function () { return this.pray(''); };
        G.templeHeal = function () { say(this, N.t('temple.heal')); };
        // Kept for older callers; it no longer hands out a free refill.
        G.restoreFullyAtTemple = function () { return { hp: 0, mp: 0 }; };

        // ---------------------------------------------------- palace quests
        function addCompanion(quest, { announce = false } = {}) {
            const c = quest.companion;
            if (!c || G.state.companions.some(x => x.questCompanion === quest.quest_id || x.name === c.name)) return false;
            G.state.companions.push({ id: c.id, name: c.name, title: c.title, role: c.role || 'companion', maxHp: c.maxHp || 100, hp: c.maxHp || 100, attack: c.attack || 12, heal: c.heal || 0, questCompanion: quest.quest_id });
            if (!G.state.combatGroup.includes(c.name)) G.state.combatGroup.push(c.name);
            if (announce) say(G, N.t('quest.rejoin', { companion: c.name }), 'npc');
            return true;
        }
        function removeCompanion(questId) {
            const leaving = G.state.companions.filter(c => c.questCompanion === questId).map(c => c.name);
            G.state.companions = G.state.companions.filter(c => c.questCompanion !== questId);
            G.state.combatGroup = G.state.combatGroup.filter(name => !leaving.includes(name));
        }

        let catchingUp = false;
        function syncQuests(view) {
            const P = palace(G);
            // One-time move of the old device-only Royal Forest Hunt onto the server.
            const legacy = G.state.quests.find(q => q.id === 'royal_hunt');
            if (legacy || (G.state.completedQuests.includes('royal_hunt') && !P.completed.includes('royal_hunt') && !P._legacyDone)) {
                P._legacyDone = true;
                const known = (view.quests || []).some(q => q.quest_id === 'royal_hunt');
                if (legacy) {
                    const current = Number(legacy.objectives?.[0]?.current) || 0;
                    G.state.quests = G.state.quests.filter(q => q.id !== 'royal_hunt');
                    if (!known) { S.call('quest_accept', S.heroArgs({ quest_id: 'royal_hunt', legacy: 'accepted', progress: current })); P.active = { ...catalogEntry('royal_hunt'), progress: Math.min(4, current) }; addCompanion(P.active); }
                } else if (!known) { S.call('quest_accept', S.heroArgs({ quest_id: 'royal_hunt', legacy: 'completed' })); P.completed.push('royal_hunt'); }
            }
            for (const q of view.quests || []) {
                if (q.status === 'completed') { if (!P.completed.includes(q.quest_id)) P.completed.push(q.quest_id); if (P.active?.quest_id === q.quest_id) { removeCompanion(q.quest_id); P.active = null; } }
                else if (q.status === 'accepted') {
                    const base = catalogEntry(q.quest_id) || {};
                    const local = P.active?.quest_id === q.quest_id ? P.active.progress : 0;
                    P.active = { ...base, quest_id: q.quest_id, target: q.target, companion: q.companion || base.companion, progress: Math.max(Number(q.progress) || 0, local || 0) };
                    if (!G.state.inCombat) addCompanion(P.active, { announce: Boolean(P._companionSeen) });
                    P._companionSeen = true;
                    // Battles won while the server was unreachable.
                    if (local > q.progress && !catchingUp) { catchingUp = true; reportProgress().finally(() => { catchingUp = false; }); }
                }
            }
            // Finished or accepted while offline and never recorded.
            if (!P._offlineSync) {
                const known = new Set((view.quests || []).map(q => q.quest_id));
                P._offlineSync = true;
                for (const id of P.completed) if (!known.has(id) && catalogEntry(id)) S.call('quest_accept', S.heroArgs({ quest_id: id, legacy: 'completed' }));
                if (P.active && !known.has(P.active.quest_id)) S.call('quest_accept', S.heroArgs({ quest_id: P.active.quest_id, legacy: 'accepted', progress: P.active.progress }));
            }
        }

        async function reportProgress() {
            const P = palace(G);
            for (let guard = 0; guard < 25 && P.active && S.canCall(); guard++) {
                const result = await S.call('quest_progress', S.heroArgs({ quest_id: P.active.quest_id, progress: P.active.progress }));
                if (!result.ok || !P.active || result.progress >= P.active.progress || result.status === 'completed') break;
            }
        }

        const oldCheck = G.checkQuests.bind(G);
        G.checkQuests = function (type, target) {
            const P = palace(this), q = P.active;
            if (type === 'kill' && q && q.progress < q.target) {
                q.progress++;
                const params = { name: questName(q.quest_id), progress: q.progress, target: q.target };
                if (q.progress >= q.target) {
                    const guide = atQuestRoom(this) ? courtDirections(this) : N.t('quest.openJournal');
                    say(this, N.t('quest.finalVictory', { ...params, guide }), 'treasure', { sfx: ['game-win'] });
                } else say(this, N.t('quest.progress', params), 'treasure');
                if (S.canCall()) S.call('quest_progress', S.heroArgs({ quest_id: q.quest_id, progress: q.progress }));
                this.save?.();
            }
            return oldCheck(type, target);
        };

        function finishQuestLocally(q, reward) {
            const P = palace(G);
            const companion = q.companion?.name || '';
            removeCompanion(q.quest_id);
            P.active = null;
            if (!P.completed.includes(q.quest_id)) P.completed.push(q.quest_id);
            S.pay(reward.gold, reward.xp);
            if (q.quest_id === 'royal_hunt' && !G.state.completedQuests.includes('royal_hunt')) {
                // The class-helper award for the first palace quest lives in an older file.
                const before = [...G.state.quests], add = G.addNarrative;
                try { G.addNarrative = function (text, type) { if (!/^📜 Quest Complete/.test(String(text))) return add.call(this, text, type); }; G.completeQuest({ id: 'royal_hunt', name: questName('royal_hunt'), reward: {}, objectives: [] }); }
                finally { G.addNarrative = add; G.state.quests = before; }
            }
            const paid = reward.xp > 0 || reward.gold > 0;
            say(G, N.t(paid ? 'quest.completed' : 'quest.previouslyPaid', { name: questName(q.quest_id), xp: reward.xp, gold: reward.gold, companion }), 'treasure', paid ? { sfx: ['coin'] } : {});
            G.updateHUD?.(); G.save?.();
        }

        function acceptLocally(entry) {
            const P = palace(G);
            P.active = { ...entry, progress: Number(entry.progress) || 0 };
            P._companionSeen = true;
            addCompanion(P.active);
            const c = P.active.companion || {};
            say(G, N.t('quest.accepted', { name: questName(entry.quest_id), desc: questDesc(entry.quest_id), companion: c.name || '', title: c.title || '', xp: entry.reward_xp, gold: entry.reward_gold }), 'treasure', { sfx: ['pickup'] });
            G.save?.();
        }

        G.palaceQuest = async function () {
            const P = palace(this);
            if (!atQuestRoom(this)) { say(this, N.t('quest.notHere')); return false; }
            if (this._questBusy) { say(this, N.t('quest.busy')); return false; }
            const q = P.active;
            this._questBusy = true;
            try {
                if (q && q.progress >= q.target) {
                    if (S.canCall()) {
                        await reportProgress();
                        const result = await S.call('quest_complete', S.heroArgs({ quest_id: q.quest_id }));
                        if (result.ok) { finishQuestLocally(q, result.completed ? result.reward : { gold: 0, xp: 0 }); return true; }
                        if (result.error === 'quest_not_finished') { say(this, N.t('quest.active', { name: questName(q.quest_id), progress: q.progress, target: q.target, companion: q.companion?.name || '' })); return false; }
                        if (!['network', 'offline', 'server_error'].includes(result.error)) return false;
                    }
                    finishQuestLocally(q, { gold: q.reward_gold || 0, xp: q.reward_xp || 0 });
                    P._offlineSync = false;
                    return true;
                }
                if (q) { addCompanion(q); say(this, N.t('quest.active', { name: questName(q.quest_id), progress: q.progress, target: q.target, companion: q.companion?.name || '' })); return true; }
                const next = CATALOG.find(entry => !P.completed.includes(entry.quest_id));
                if (!next) { say(this, N.t('quest.allDone'), 'treasure'); return true; }
                if (S.canCall()) {
                    const result = await S.call('quest_accept', S.heroArgs({ quest_id: next.quest_id }));
                    if (result.ok) {
                        if (result.accepted) { acceptLocally({ ...next, target: result.target, reward_xp: result.reward_xp, reward_gold: result.reward_gold, companion: result.companion || next.companion, progress: result.progress }); return true; }
                        if (result.already === 'completed') { P.completed.push(next.quest_id); this._questBusy = false; return this.palaceQuest(); }
                        if (result.already === 'accepted') { acceptLocally({ ...next, target: result.target, companion: result.companion || next.companion, progress: result.progress }); return true; }
                        return false;
                    }
                    if (!['network', 'offline', 'server_error'].includes(result.error)) return false;
                }
                acceptLocally(next);
                P._offlineSync = false;
                return true;
            } finally { this._questBusy = false; }
        };

        function courtDirections(game) {
            if (atQuestRoom(game)) return N.t('quest.routeHere', { action: N.t('btn.palaceQuest') });
            const start = game.state.location;
            let best;
            for (const room of QUEST_ROOMS) {
                const route = game.findPhysicalRoute?.(start, room);
                if (route?.length && (!best || route.length < best.length)) best = route;
            }
            const direction = best?.[0];
            const next = WorldData.locations[start]?.exits?.[direction];
            return WorldData.locations[next]?.name
                ? N.t('quest.routeStep', { direction, room: WorldData.locations[next].name })
                : N.t('quest.routeMissing');
        }

        const baseJournalEntries = G.questJournalEntries.bind(G);
        G.questJournalEntries = function () {
            const entries = baseJournalEntries();
            const q = this.state.sacred?.palace?.active;
            if (!q) return entries;
            const name = questName(q.quest_id);
            const step = q.progress >= q.target
                ? N.t('quest.ready', { name, target: q.target })
                : N.t('quest.progress', { name: q.companion?.name || name, progress: q.progress, target: q.target });
            return [{ name, description: questDesc(q.quest_id), steps: q.progress >= q.target ? [step, courtDirections(this)] : [step] }, ...entries];
        };

        // ---------------------------------------------------- location buttons
        const oldContext = G.updateContextActions?.bind(G);
        if (oldContext) G.updateContextActions = function () {
            oldContext();
            const box = document.getElementById('context-actions');
            if (!box) return;
            for (const button of [...box.querySelectorAll('button')]) {
                const action = button.getAttribute('onclick') || '';
                if (/showPrayerChoices|claimDailyTempleBlessing/.test(action)) {
                    button.removeAttribute('onclick');
                    button.textContent = N.t('btn.pray');
                    button.addEventListener('click', () => this.pray(''));
                    if (sacred(G).firstPrayerDone && !sacred(G).permanentTempleBlessing) {
                        const extra = document.createElement('button');
                        extra.type = 'button'; extra.textContent = N.t('btn.lasting');
                        extra.addEventListener('click', () => this.claimPermanentTempleBlessing(''));
                        button.after(extra);
                    }
                }
            }
            if (atQuestRoom(this) && !box.querySelector('[data-bsu="palace-quest"]')) {
                if (!box.querySelector('strong')) { const title = document.createElement('strong'); title.textContent = 'Location actions:'; box.prepend(title); }
                const button = document.createElement('button');
                button.type = 'button'; button.dataset.bsu = 'palace-quest'; button.textContent = N.t('btn.palaceQuest');
                button.addEventListener('click', () => this.palaceQuest());
                box.appendChild(button);
            }
        };

        const oldCommand = G.processCommand.bind(G);
        G.processCommand = function (raw) {
            const c = String(raw || '').trim().toLowerCase();
            if (c === 'report quest' || c === 'complete quest' || c === 'accept quest' || c === 'quest status' || c === 'palace quest' || c === 'receive quest') {
                if (atQuestRoom(this) || c !== 'quest status') { this.palaceQuest(); return; }
                const q = palace(this).active;
                if (q) { say(this, N.t(q.progress >= q.target ? 'quest.ready' : 'quest.active', { name: questName(q.quest_id), progress: q.progress, target: q.target, companion: q.companion?.name || '' })); return; }
            }
            if (c === 'blessing' || c === 'blessings' || c === 'daily blessing') { if (inTemple(this)) { this.pray(''); return; } }
            return oldCommand(raw);
        };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
