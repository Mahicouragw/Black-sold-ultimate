/* Black Soul Ultimate v7.55 — Snakes & Ladders and Chess in the Game Hall.
 *
 * What this file does:
 *   - Snakes & Ladders (2-4 players) and Chess against the computer or against
 *     friends online. The game server is the referee: it rolls the dice, checks
 *     every move and pays the rewards. The browser only shows and speaks what the
 *     server reports, so two players always see the same game.
 *   - When the server cannot be reached, games against the computer still work as
 *     practice games (same rules, no rewards). Online games say why they cannot start.
 *   - Everything that happens is spoken once, in order, in the game language
 *     (English, Telugu, Hindi), with one recorded sound per event.
 *   - Chess has a board of real buttons (tap a piece, hear its legal moves, tap the
 *     destination) as well as typed moves such as "e2 e4".
 *   - Leaving a game always asks first, and says what leaving will cost.
 *
 * Ludo, Carrom and Blackjack keep their existing implementation in game-hall.js.
 */
import { Chess } from './assets/vendor/chess.js';
import { chooseMove, describeMove } from './chess-ai-v755.js';

(() => {
  const hall = window.GameHall;
  if (!hall || hall._v755) return;
  hall._v755 = true;

  const BOARD = {
    snakes: { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78 },
    ladders: { 4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91 }
  };
  const COLORS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'White', 'Black', 'Purple', 'Gold', 'Silver'];
  const GLYPH = { wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔', bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚' };
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const $ = id => document.getElementById(id);
  const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /* ───────────── text: English, Telugu, Hindi ───────────── */
  const TEXT = {
    'hall.setup.snakes': ['Snakes and Ladders. Choose the number of players, then play against the computer or invite friends.', 'పాములు నిచ్చెనలు. ఆటగాళ్ల సంఖ్యను ఎంచుకోండి. తర్వాత కంప్యూటర్‌తో ఆడండి లేదా స్నేహితులను ఆహ్వానించండి.', 'साँप सीढ़ी। खिलाड़ियों की संख्या चुनें, फिर कंप्यूटर के साथ खेलें या दोस्तों को बुलाएँ।'],
    'hall.setup.chess': ['Chess. Choose your side and the computer level, or invite a friend.', 'చదరంగం. మీ వైపు మరియు కంప్యూటర్ స్థాయిని ఎంచుకోండి, లేదా స్నేహితుడిని ఆహ్వానించండి.', 'शतरंज। अपना पक्ष और कंप्यूटर का स्तर चुनें, या किसी दोस्त को बुलाएँ।'],
    'hall.practice': ['The game server cannot be reached, so this is a practice game. The rules are the same, but no rewards are given.', 'గేమ్ సర్వర్ అందుబాటులో లేదు, కాబట్టి ఇది సాధన ఆట. నియమాలు అవే, కానీ బహుమతులు ఉండవు.', 'गेम सर्वर से संपर्क नहीं हो रहा, इसलिए यह अभ्यास खेल है। नियम वही हैं, पर इनाम नहीं मिलेगा।'],
    'hall.needOnline': ['Games against other players are not available in this version. You can play against the computer.', 'ఇతర ఆటగాళ్లతో ఆటలు ఈ వెర్షన్‌లో అందుబాటులో లేవు. మీరు కంప్యూటర్‌తో ఆడవచ్చు.', 'दूसरे खिलाड़ियों के साथ खेल इस संस्करण में उपलब्ध नहीं हैं। आप कंप्यूटर के साथ खेल सकते हैं।'],
    'hall.pickFriend': ['Choose at least one player to invite.', 'ఆహ్వానించడానికి కనీసం ఒక ఆటగాడిని ఎంచుకోండి.', 'बुलाने के लिए कम से कम एक खिलाड़ी चुनें।'],
    'hall.nobody': ['No other players are in the game hall right now.', 'ప్రస్తుతం గేమ్ హాల్‌లో ఇతర ఆటగాళ్లు ఎవరూ లేరు.', 'अभी गेम हॉल में कोई और खिलाड़ी नहीं है।'],
    'hall.waiting': ['Match created. Waiting for the invited players to answer.', 'మ్యాచ్ సృష్టించబడింది. ఆహ్వానించిన ఆటగాళ్ల సమాధానం కోసం వేచి ఉన్నాం.', 'मैच बन गया। बुलाए गए खिलाड़ियों के जवाब का इंतज़ार है।'],
    'hall.invited': ['{name} was invited.', '{name} ను ఆహ్వానించారు.', '{name} को बुलाया गया।'],
    'hall.joined': ['{name} joined the game.', '{name} ఆటలో చేరారు.', '{name} खेल में शामिल हुए।'],
    'hall.rejected': ['{name} declined the invitation.', '{name} ఆహ్వానాన్ని తిరస్కరించారు.', '{name} ने निमंत्रण ठुकरा दिया।'],
    'hall.cancelled': ['The match was cancelled.', 'మ్యాచ్ రద్దు చేయబడింది.', 'मैच रद्द कर दिया गया।'],
    'hall.invite.got': ['{host} invites you to play {game}.', '{host} మిమ్మల్ని {game} ఆడటానికి ఆహ్వానిస్తున్నారు.', '{host} आपको {game} खेलने के लिए बुला रहे हैं।'],
    'hall.game.snakes': ['Snakes and Ladders', 'పాములు నిచ్చెనలు', 'साँप सीढ़ी'],
    'hall.game.chess': ['Chess', 'చదరంగం', 'शतरंज'],
    'hall.start': ['The game begins.', 'ఆట మొదలైంది.', 'खेल शुरू हुआ।'],
    'hall.resumed': ['You are back in your game.', 'మీరు మీ ఆటలోకి తిరిగి వచ్చారు.', 'आप अपने खेल में वापस आ गए हैं।'],
    'hall.turn.me.snakes': ['Your turn. Roll the dice.', 'మీ వంతు. పాచిక వేయండి.', 'आपकी बारी। पासा फेंकें।'],
    'hall.turn.me.chess': ['Your move.', 'మీ ఎత్తు.', 'आपकी चाल।'],
    'hall.turn.other': ["{name}'s turn.", '{name} వంతు.', '{name} की बारी।'],
    'hall.notYourTurn': ['It is not your turn. Waiting for {name}.', 'ఇది మీ వంతు కాదు. {name} కోసం వేచి ఉన్నాం.', 'अभी आपकी बारी नहीं है। {name} का इंतज़ार है।'],
    'hall.roll.me': ['You rolled {die}.', 'మీకు {die} పడింది.', 'आपका पासा {die} आया।'],
    'hall.roll.other': ['{name} rolled {die}.', '{name} కు {die} పడింది.', '{name} का पासा {die} आया।'],
    'hall.step.me': ['You move from square {from} to square {to}.', 'మీరు {from} గడి నుండి {to} గడికి వెళ్లారు.', 'आप खाने {from} से खाने {to} पर पहुँचे।'],
    'hall.step.other': ['{name} moves from square {from} to square {to}.', '{name} {from} గడి నుండి {to} గడికి వెళ్లారు.', '{name} खाने {from} से खाने {to} पर पहुँचे।'],
    'hall.exact.me': ['You need exactly {need} to finish. You stay on square {from}.', 'ముగించడానికి మీకు సరిగ్గా {need} కావాలి. మీరు {from} గడిలోనే ఉన్నారు.', 'खेल पूरा करने के लिए ठीक {need} चाहिए। आप खाने {from} पर ही हैं।'],
    'hall.exact.other': ['{name} needs exactly {need} to finish and stays on square {from}.', '{name} కు ముగించడానికి సరిగ్గా {need} కావాలి. {from} గడిలోనే ఉన్నారు.', '{name} को ठीक {need} चाहिए। वे खाने {from} पर ही हैं।'],
    'hall.ladder.me': ['A ladder! You climb from square {from} up to square {to}.', 'నిచ్చెన! మీరు {from} గడి నుండి {to} గడికి ఎక్కారు.', 'सीढ़ी! आप खाने {from} से चढ़कर खाने {to} पर पहुँचे।'],
    'hall.ladder.other': ['A ladder! {name} climbs from square {from} up to square {to}.', 'నిచ్చెన! {name} {from} గడి నుండి {to} గడికి ఎక్కారు.', 'सीढ़ी! {name} खाने {from} से चढ़कर खाने {to} पर पहुँचे।'],
    'hall.snake.me': ['A snake! You slide from square {from} down to square {to}.', 'పాము! మీరు {from} గడి నుండి {to} గడికి జారిపోయారు.', 'साँप! आप खाने {from} से फिसलकर खाने {to} पर आ गए।'],
    'hall.snake.other': ['A snake! {name} slides from square {from} down to square {to}.', 'పాము! {name} {from} గడి నుండి {to} గడికి జారిపోయారు.', 'साँप! {name} खाने {from} से फिसलकर खाने {to} पर आ गए।'],
    'hall.home.me': ['You reach square 100 and finish in place {rank}.', 'మీరు 100వ గడికి చేరి {rank}వ స్థానంలో ముగించారు.', 'आप खाने 100 पर पहुँचे और स्थान {rank} पर रहे।'],
    'hall.home.other': ['{name} reaches square 100 and finishes in place {rank}.', '{name} 100వ గడికి చేరి {rank}వ స్థానంలో ముగించారు.', '{name} खाने 100 पर पहुँचे और स्थान {rank} पर रहे।'],
    'hall.pos': ['{name}: square {pos}', '{name}: {pos} గడి', '{name}: खाना {pos}'],
    'hall.you': ['You', 'మీరు', 'आप'],
    'hall.left': ['{name} left the game.', '{name} ఆట నుండి వెళ్లిపోయారు.', '{name} खेल छोड़कर चले गए।'],
    'hall.away': ['{name} is not responding.', '{name} స్పందించడం లేదు.', '{name} जवाब नहीं दे रहे।'],
    'hall.back': ['{name} is back.', '{name} తిరిగి వచ్చారు.', '{name} वापस आ गए।'],
    'hall.over': ['The game is over.', 'ఆట ముగిసింది.', 'खेल खत्म हुआ।'],
    'hall.place': ['Place {rank}: {name}.', '{rank}వ స్థానం: {name}.', 'स्थान {rank}: {name}।'],
    'hall.myPlace': ['You finished in place {rank} of {n}.', '{n} మందిలో మీరు {rank}వ స్థానంలో నిలిచారు.', '{n} में से आप स्थान {rank} पर रहे।'],
    'hall.win': ['You won!', 'మీరు గెలిచారు!', 'आप जीत गए!'],
    'hall.lose': ['You lost.', 'మీరు ఓడిపోయారు.', 'आप हार गए।'],
    'hall.draw': ['The game is a draw.', 'ఆట డ్రాగా ముగిసింది.', 'खेल बराबरी पर खत्म हुआ।'],
    'hall.reason.checkmate': ['Checkmate.', 'చెక్‌మేట్.', 'शह और मात।'],
    'hall.reason.stalemate': ['Stalemate.', 'స్టేల్‌మేట్.', 'गतिरोध।'],
    'hall.reason.resignation': ['By resignation.', 'ఆట వదిలేయడం వల్ల.', 'हार मानने से।'],
    'hall.reason.left': ['The opponent left the game.', 'ప్రత్యర్థి ఆట వదిలి వెళ్లారు.', 'प्रतिद्वंद्वी खेल छोड़ गया।'],
    'hall.reason.disconnected': ['The opponent lost the connection for too long.', 'ప్రత్యర్థి కనెక్షన్ చాలా సేపు తెగిపోయింది.', 'प्रतिद्वंद्वी का कनेक्शन बहुत देर तक टूटा रहा।'],
    'hall.reason.agreement': ['By agreement.', 'ఇద్దరి అంగీకారంతో.', 'आपसी सहमति से।'],
    'hall.reason.insufficient_material': ['Not enough pieces to checkmate.', 'చెక్‌మేట్ చేయడానికి తగిన పావులు లేవు.', 'मात देने के लिए पर्याप्त मोहरे नहीं।'],
    'hall.reason.threefold_repetition': ['The same position was repeated three times.', 'అదే స్థితి మూడుసార్లు పునరావృతమైంది.', 'एक ही स्थिति तीन बार दोहराई गई।'],
    'hall.reason.fifty_move_rule': ['Fifty moves without a capture or a pawn move.', 'పట్టడం లేదా బంటు కదలిక లేకుండా యాభై ఎత్తులు.', 'बिना मारे या प्यादा चले पचास चालें।'],
    'hall.reward': ['You earned {gold} rupees and {xp} experience.', 'మీకు {gold} రూపాయలు, {xp} అనుభవం లభించాయి.', 'आपको {gold} रुपये और {xp} अनुभव मिला।'],
    'hall.reward.capped': ['You have reached today\'s limit for computer-game rewards. No reward this time.', 'ఈ రోజు కంప్యూటర్ ఆటల బహుమతుల పరిమితి చేరుకున్నారు. ఈసారి బహుమతి లేదు.', 'आज कंप्यूटर वाले खेलों के इनाम की सीमा पूरी हो गई। इस बार इनाम नहीं।'],
    'hall.reward.none': ['No reward for this game.', 'ఈ ఆటకు బహుమతి లేదు.', 'इस खेल के लिए कोई इनाम नहीं।'],
    'hall.reward.practice': ['Practice game. No rewards.', 'సాధన ఆట. బహుమతులు లేవు.', 'अभ्यास खेल। कोई इनाम नहीं।'],
    'hall.leave.title': ['Leave the game?', 'ఆట వదిలి వెళ్లాలా?', 'खेल छोड़ें?'],
    'hall.leave.active': ['The game is still being played. If you leave now, you lose this game. Leave anyway?', 'ఆట ఇంకా జరుగుతోంది. ఇప్పుడు వెళ్లిపోతే మీరు ఈ ఆట ఓడిపోతారు. అయినా వెళ్లాలా?', 'खेल अभी चल रहा है। अभी छोड़ने पर आप यह खेल हार जाएँगे। फिर भी छोड़ें?'],
    'hall.leave.waiting': ['The game has not started yet. Leave the match?', 'ఆట ఇంకా మొదలు కాలేదు. మ్యాచ్ వదిలి వెళ్లాలా?', 'खेल अभी शुरू नहीं हुआ। मैच छोड़ें?'],
    'hall.leave.yes': ['Yes, leave', 'అవును, వెళ్లిపోతాను', 'हाँ, छोड़ें'],
    'hall.leave.kept': ['You stay in the game.', 'మీరు ఆటలోనే ఉన్నారు.', 'आप खेल में बने हुए हैं।'],
    'hall.leave.done': ['You left the game.', 'మీరు ఆట వదిలి వెళ్లారు.', 'आपने खेल छोड़ दिया।'],
    'hall.resign.title': ['Resign the game?', 'ఆట వదిలేయాలా?', 'हार मानें?'],
    'hall.resign.body': ['Resigning means you lose this game. Resign?', 'వదిలేస్తే మీరు ఈ ఆట ఓడిపోతారు. వదిలేయాలా?', 'हार मानने पर आप यह खेल हार जाएँगे। हार मानें?'],
    'hall.resign.yes': ['Yes, resign', 'అవును, వదిలేస్తాను', 'हाँ, हार मानता हूँ'],
    'hall.resigned': ['{name} resigned.', '{name} ఆట వదిలేశారు.', '{name} ने हार मान ली।'],
    'hall.draw.offer.me': ['You offered a draw.', 'మీరు డ్రా ప్రతిపాదించారు.', 'आपने बराबरी का प्रस्ताव दिया।'],
    'hall.draw.offer.other': ['{name} offers a draw. Choose Accept draw or Decline draw.', '{name} డ్రా ప్రతిపాదించారు. డ్రా అంగీకరించు లేదా తిరస్కరించు ఎంచుకోండి.', '{name} ने बराबरी का प्रस्ताव दिया। स्वीकार करें या ठुकराएँ।'],
    'hall.draw.declined': ['The draw offer was declined.', 'డ్రా ప్రతిపాదన తిరస్కరించబడింది.', 'बराबरी का प्रस्ताव ठुकरा दिया गया।'],
    'hall.draw.accepted': ['The draw was accepted.', 'డ్రా అంగీకరించబడింది.', 'बराबरी स्वीकार कर ली गई।'],
    'hall.error.illegal_move': ['That move is not legal.', 'ఆ ఎత్తు చెల్లదు.', 'यह चाल मान्य नहीं है।'],
    'hall.error.already_in_match': ['You are already in a game. Finish or leave it first.', 'మీరు ఇప్పటికే ఒక ఆటలో ఉన్నారు. ముందు దాన్ని ముగించండి లేదా వదిలేయండి.', 'आप पहले से एक खेल में हैं। पहले उसे पूरा करें या छोड़ें।'],
    'hall.error.network': ['The game server did not answer. Check your connection and try again.', 'గేమ్ సర్వర్ స్పందించలేదు. మీ కనెక్షన్ చూసి మళ్లీ ప్రయత్నించండి.', 'गेम सर्वर ने जवाब नहीं दिया। कनेक्शन जाँचकर फिर कोशिश करें।'],
    'hall.error.slow_down': ['Too many requests. Wait a moment and try again.', 'చాలా ఎక్కువ అభ్యర్థనలు. కొద్దిసేపు ఆగి మళ్లీ ప్రయత్నించండి.', 'बहुत अधिक अनुरोध। थोड़ा रुककर फिर कोशिश करें।'],
    'hall.error.not_waiting': ['That match is no longer waiting for players.', 'ఆ మ్యాచ్ ఇక ఆటగాళ్ల కోసం వేచి లేదు.', 'वह मैच अब खिलाड़ियों का इंतज़ार नहीं कर रहा।'],
    'hall.error.match_full': ['That match is already full.', 'ఆ మ్యాచ్ ఇప్పటికే నిండిపోయింది.', 'वह मैच पहले से भरा है।'],
    'hall.error.unknown_player': ['That player could not be found.', 'ఆ ఆటగాడు దొరకలేదు.', 'वह खिलाड़ी नहीं मिला।'],
    'hall.error.not_active': ['This game is not being played right now.', 'ఈ ఆట ప్రస్తుతం జరగడం లేదు.', 'यह खेल अभी नहीं चल रहा।'],
    'hall.error.draw_already_offered': ['A draw has already been offered.', 'డ్రా ఇప్పటికే ప్రతిపాదించబడింది.', 'बराबरी का प्रस्ताव पहले ही दिया जा चुका है।'],
    'hall.error.unauthenticated': ['Sign in to play on the game server.', 'గేమ్ సర్వర్‌లో ఆడటానికి సైన్ ఇన్ చేయండి.', 'गेम सर्वर पर खेलने के लिए साइन इन करें।'],
    'hall.error.other': ['The game server refused that: {code}.', 'గేమ్ సర్వర్ దాన్ని తిరస్కరించింది: {code}.', 'गेम सर्वर ने इसे अस्वीकार किया: {code}।'],
    'chess.white': ['White', 'తెలుపు', 'सफ़ेद'], 'chess.black': ['Black', 'నలుపు', 'काला'],
    'chess.p': ['pawn', 'బంటు', 'प्यादा'], 'chess.n': ['knight', 'గుర్రం', 'घोड़ा'], 'chess.b': ['bishop', 'శకటం', 'ऊँट'],
    'chess.r': ['rook', 'ఏనుగు', 'हाथी'], 'chess.q': ['queen', 'మంత్రి', 'वज़ीर'], 'chess.k': ['king', 'రాజు', 'राजा'],
    'chess.youAre': ['You play {color}.', 'మీరు {color} పావులతో ఆడుతున్నారు.', 'आप {color} मोहरों से खेल रहे हैं।'],
    'chess.move': ['{color} {piece} from {from} to {to}.', '{color} {piece} {from} నుండి {to} కు.', '{color} {piece} {from} से {to} पर।'],
    'chess.capture': ['{color} {piece} from {from} takes {captured} on {to}.', '{color} {piece} {from} నుండి {to} లోని {captured}ను పట్టింది.', '{color} {piece} ने {from} से {to} पर {captured} को मारा।'],
    'chess.castle.king': ['{color} castles on the king side.', '{color} రాజు వైపు క్యాజ్లింగ్ చేసింది.', '{color} ने राजा की ओर किलेबंदी की।'],
    'chess.castle.queen': ['{color} castles on the queen side.', '{color} మంత్రి వైపు క్యాజ్లింగ్ చేసింది.', '{color} ने वज़ीर की ओर किलेबंदी की।'],
    'chess.promotes': ['The pawn becomes a {piece}.', 'బంటు {piece}గా మారింది.', 'प्यादा {piece} बन गया।'],
    'chess.enpassant': ['En passant.', 'ఎన్ పాసెంట్.', 'एन पासां।'],
    'chess.check': ['Check.', 'చెక్.', 'शह।'],
    'chess.selected': ['{piece} on {sq} selected. It can move to: {list}.', '{sq} లోని {piece} ఎంచుకోబడింది. ఇది వెళ్లగల గడులు: {list}.', '{sq} का {piece} चुना गया। यह यहाँ जा सकता है: {list}।'],
    'chess.takes': ['{sq}, taking the {piece}', '{sq}, {piece}ను పడుతూ', '{sq}, {piece} को मारते हुए'],
    'chess.noMoves': ['The {piece} on {sq} has no legal moves.', '{sq} లోని {piece}కు చెల్లే ఎత్తులు లేవు.', '{sq} के {piece} की कोई मान्य चाल नहीं है।'],
    'chess.empty': ['{sq} is empty.', '{sq} ఖాళీగా ఉంది.', '{sq} खाली है।'],
    'chess.notYours': ['{sq} holds the opponent\'s {piece}.', '{sq} లో ప్రత్యర్థి {piece} ఉంది.', '{sq} पर प्रतिद्वंद्वी का {piece} है।'],
    'chess.cancelled': ['Selection cancelled.', 'ఎంపిక రద్దు చేయబడింది.', 'चयन रद्द किया गया।'],
    'chess.typed': ['Type a move such as e2 e4.', 'e2 e4 వంటి ఎత్తును టైప్ చేయండి.', 'e2 e4 जैसी चाल लिखें।'],
    'chess.last.none': ['No move has been played yet.', 'ఇంకా ఏ ఎత్తూ వేయలేదు.', 'अभी तक कोई चाल नहीं चली गई।'],
    'chess.sq.empty': ['empty', 'ఖాళీ', 'खाली']
  };
  let textReady = false;
  function tr(key, params = {}) {
    const N = window.Narration;
    if (N && !textReady) { N.add(TEXT); textReady = true; }
    if (N) return N.t(key, params);
    return (TEXT[key] ? TEXT[key][0] : key).replace(/\{(\w+)\}/g, (whole, name) => params[name] === undefined ? '' : String(params[name]));
  }

  /* ───────────── practice referee (offline): same actions and events as the server ───────────── */
  function createLocalReferee(heroName) {
    let match = null, players = [], events = [], chess = null;
    const event = (type, data) => { match.seq++; events.push({ seq: match.seq, type, data: clone(data) }); };
    const view = (since = 0, extra = {}) => ({ ok: true, local: true, match: clone(match), players: clone(players), my_seat: 0, events: events.filter(e => e.seq > since).map(clone), ...extra });
    const fail = error => ({ ok: false, error });
    const finish = () => {
      match.status = 'finished';
      match.result = { ...(match.result || { outcome: 'ranked' }), rankings: players.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.seat - b.seat).map(p => ({ seat: p.seat, name: p.name, color: p.color, rank: p.rank, is_ai: p.is_ai, left: p.status === 'left', gold: 0, xp: 0, capped: false })) };
      event('finished', match.result);
    };
    const open = p => p.status === 'joined' && p.rank == null;
    const snakesCheckEnd = () => {
      const remaining = players.filter(open);
      if (remaining.length > 1 && remaining.some(p => !p.is_ai)) return false;
      remaining.sort((a, b) => match.state.pos[b.seat] - match.state.pos[a.seat] || a.seat - b.seat).forEach(p => { p.rank = match.state.next_rank++; });
      match.result = { outcome: 'ranked' };
      finish();
      return true;
    };
    const snakesStep = () => {
      const seat = match.turn_seat, from = match.state.pos[seat], die = 1 + Math.floor(Math.random() * 6);
      let landed = from + die; if (landed > 100) landed = from;
      let to = landed, via = null;
      if (landed !== from && BOARD.ladders[landed]) { to = BOARD.ladders[landed]; via = 'ladder'; }
      else if (landed !== from && BOARD.snakes[landed]) { to = BOARD.snakes[landed]; via = 'snake'; }
      match.state.pos[seat] = to;
      let rank = null;
      if (to === 100) { rank = match.state.next_rank++; players[seat].rank = rank; }
      match.version++;
      event('roll', { seat, die, from, landed, to, via, rank });
      if (snakesCheckEnd()) return;
      let next = seat;
      for (let i = 0; i < match.seats; i++) { next = (next + 1) % match.seats; if (open(players[next])) break; }
      match.turn_seat = next; match.version++;
      event('turn', { seat: next });
    };
    const chessFinish = (winnerSeat, reason) => {
      if (winnerSeat == null) { players.forEach(p => { p.rank = 1; }); match.result = { outcome: 'draw', reason }; }
      else { players[winnerSeat].rank = 1; players[1 - winnerSeat].rank = 2; match.result = { outcome: 'win', winner_seat: winnerSeat, reason }; }
      finish();
    };
    const chessCommit = (move, seat) => {
      const facts = describeMove(move, chess);
      match.state.fen = facts.fen; match.state.history.push(facts.san); match.state.last = { from: facts.from, to: facts.to, san: facts.san, seat };
      match.version++;
      event('move', { ...facts, seat });
      if (facts.over === 'checkmate') chessFinish(seat, 'checkmate');
      else if (facts.over) chessFinish(null, facts.draw_reason || facts.over);
      else match.turn_seat = 1 - seat;
    };
    const computerChess = () => {
      if (match.status !== 'active' || match.turn_seat !== 1) return;
      const choice = chooseMove(chess, Number(match.state.ai_level) || 2);
      if (choice) chessCommit(chess.move(choice), 1);
    };
    return {
      handle(action, args = {}) {
        if (action === 'match_create') {
          const game = args.game === 'chess' ? 'chess' : 'snakes', seats = game === 'chess' ? 2 : Math.max(2, Math.min(4, Number(args.seats) || 2));
          match = { id: 'practice', seq: 0, game, host: true, mode: 'ai', seats, state: {}, result: null, status: 'active', version: 1, turn_seat: 0 };
          events = [];
          const free = COLORS.filter(c => c !== args.color);
          players = Array.from({ length: seats }, (_, seat) => ({ me: seat === 0 ? true : null, away: false, name: seat === 0 ? heroName : `Computer ${seat}`, rank: null, seat, color: seat === 0 ? (args.color || 'Blue') : free[seat - 1], is_ai: seat > 0, status: 'joined' }));
          event('created', { game, host: heroName, mode: 'ai', seats });
          if (game === 'snakes') { match.state = { pos: Array(seats).fill(0), last_rank: seats, next_rank: 1 }; event('start', { turn_seat: 0 }); }
          else {
            chess = new Chess();
            const whiteSeat = args.side === 'black' ? 1 : 0;
            players[whiteSeat].color = 'White'; players[1 - whiteSeat].color = 'Black';
            match.state = { fen: chess.fen(), history: [], ai_level: Math.max(1, Math.min(3, Number(args.ai_level) || 2)), white_seat: whiteSeat, draw_offer_seat: null };
            match.turn_seat = whiteSeat;
            event('start', { turn_seat: whiteSeat });
            computerChess();
          }
          return view(0);
        }
        if (!match) return fail('no_match');
        const since = Number(args.since) || 0;
        if (action === 'match_state') return view(since);
        if (action === 'snakes_roll') {
          if (match.status !== 'active') return fail('not_active');
          if (match.turn_seat !== 0) return fail('not_your_turn');
          snakesStep();
          let guard = 0;
          while (match.status === 'active' && players[match.turn_seat].is_ai && guard++ < 20) snakesStep();
          return view(since);
        }
        if (action === 'chess_move') {
          if (match.status !== 'active') return fail('not_active');
          if (match.turn_seat !== 0) return fail('not_your_turn');
          let move = null;
          try { move = chess.move({ from: args.from, to: args.to, promotion: args.promotion || 'q' }); } catch (error) { move = null; }
          if (!move) return fail('illegal_move');
          chessCommit(move, 0);
          computerChess();
          return view(since);
        }
        if (action === 'chess_action') {
          if (match.status !== 'active') return fail('not_active');
          if (args.do === 'resign') { event('resigned', { seat: 0 }); chessFinish(1, 'resignation'); }
          else if (args.do === 'offer_draw') { event('draw_offered', { seat: 0 }); event('draw_declined', { seat: 1 }); }
          else return fail('no_draw_offer');
          return view(since);
        }
        if (action === 'match_leave') {
          if (match.status === 'active') {
            players[0].status = 'left';
            event('left', { seat: 0, reason: 'left' });
            if (match.game === 'chess') chessFinish(1, 'left'); else snakesCheckEnd();
          }
          return view(since, { left: true });
        }
        return fail('unknown_action');
      }
    };
  }

  /* ───────────── the game ───────────── */
  const Play = {
    autoPoll: true,
    type: null, view: null, seq: 0, shown: null, local: null, chess: null,
    selected: null, targets: [], acting: false, lobby: { players: [], invites: [], me: null }, announcedInvites: new Set(),
    chain: Promise.resolve(), timers: { match: null, lobby: null },

    get match() { return this.view ? this.view.match : null; },
    get mySeat() { return this.view ? this.view.my_seat : 0; },
    heroName() { return String(window.Game?.state?.player?.name || 'Hero').slice(0, 24); },
    serverReady() { return Boolean(window.BSUServer && window.BSUServer.canCall()); },
    async call(action, args = {}) {
      if (this.local) return this.local.handle(action, args);
      if (!window.BSUServer) return { ok: false, error: 'offline' };
      return window.BSUServer.call(action, args);
    },

    /* speech and sound: one line, then one sound, never overlapping */
    async say(text, { wait = true } = {}) {
      if (!text) return;
      const log = $('hall-status');
      if (log) { const p = document.createElement('p'); p.textContent = text; log.appendChild(p); while (log.children.length > 20) log.removeChild(log.firstChild); log.scrollTop = log.scrollHeight; }
      const spoken = window.AudioManager?.playVoice?.(String(text));
      if (wait && spoken && typeof spoken.then === 'function') await Promise.race([spoken.catch(() => false), hall.pause(Math.min(9000, 1500 + text.length * 90))]);
    },
    async sound(name, ms = 600) { try { await window.MusicSystem?.playSFXAndWait?.(name, ms); } catch (error) { /* sound is never required */ } },
    name(seat, { plain = false } = {}) {
      const p = this.view?.players?.find(x => x.seat === seat);
      if (!p) return `Player ${seat + 1}`;
      return this.match?.game === 'snakes' && !plain ? `${p.name} (${p.color})` : p.name;
    },
    colorName(code) { return tr(code === 'w' ? 'chess.white' : 'chess.black'); },
    pieceName(code) { return tr('chess.' + code); },

    /* ───── setup screen ───── */
    showSetup(type) {
      this.type = type; hall.type = type;
      for (const id of ['hall-setup', 'hall-online-details']) { const el = $(id); if (el) { el.classList.add('hidden'); el.style.display = 'none'; } }
      const list = $('hall-game-list'); if (list) { list.classList.remove('hidden'); list.style.display = ''; }
      $('hall-help').textContent = tr('hall.setup.' + type);
      $('hall-status').innerHTML = '';
      $('hall-board').innerHTML = '';
      const options = COLORS.map(c => `<option${c === 'Blue' ? ' selected' : ''}>${c}</option>`).join('');
      const own = type === 'snakes'
        ? `<label>Players <select id="h755-seats"><option>2</option><option>3</option><option>4</option></select></label>
           <label>Your colour <select id="h755-color">${options}</select></label>`
        : `<label>Your side <select id="h755-side"><option value="white">White (moves first)</option><option value="black">Black</option></select></label>
           <label>Computer level <select id="h755-level"><option value="1">Easy</option><option value="2" selected>Medium</option><option value="3">Hard</option></select></label>`;
      $('hall-controls').innerHTML = `<div class="h755-setup">${own}
        <button id="h755-ai" class="action-btn" type="button">Play against the computer</button>
        <fieldset id="h755-online"><legend>${type === 'snakes' ? 'Play online with friends' : 'Play online with a friend'}</legend>
          <div id="h755-players" role="group" aria-label="Players in the game hall now"></div>
          <button id="h755-create" class="action-btn" type="button">Invite and create the match</button>
          <button id="h755-refresh" class="menu-btn" type="button">Refresh the player list</button>
        </fieldset>
        <div id="h755-invites" role="group" aria-label="Invitations for you"></div>
      </div>`;
      $('h755-ai').addEventListener('click', () => this.createMatch('ai'));
      $('h755-create').addEventListener('click', () => this.createMatch('online'));
      $('h755-refresh').addEventListener('click', () => this.refreshLobby({ speak: true }));
      this.renderLobby();
      this.say(tr('hall.setup.' + type), { wait: false });
      this.refreshLobby();
      this.schedule();
    },
    renderLobby() {
      const box = $('h755-players'), invites = $('h755-invites');
      if (box) {
        const single = this.type === 'chess';
        box.innerHTML = !this.serverReady() ? `<p>${esc(tr('hall.needOnline'))}</p>`
          : this.lobby.players.length ? this.lobby.players.map(p => `<label class="h755-friend"><input type="${single ? 'radio' : 'checkbox'}" name="h755-friend" value="${esc(p.pid)}" ${p.busy ? 'disabled' : ''}> ${esc(p.name)}${p.busy ? ' (in a game)' : ''}</label>`).join('')
          : `<p>${esc(tr('hall.nobody'))}</p>`;
        const create = $('h755-create'); if (create) create.disabled = !this.serverReady();
      }
      if (invites) {
        invites.innerHTML = this.lobby.invites.map(i => `<p class="h755-invite">${esc(tr('hall.invite.got', { host: i.host, game: tr('hall.game.' + i.game) }))}
          <button type="button" class="action-btn" data-accept="${esc(i.match_id)}">Accept</button>
          <button type="button" class="menu-btn" data-decline="${esc(i.match_id)}">Decline</button></p>`).join('');
        invites.querySelectorAll('[data-accept]').forEach(b => b.addEventListener('click', () => this.respond(b.dataset.accept, true)));
        invites.querySelectorAll('[data-decline]').forEach(b => b.addEventListener('click', () => this.respond(b.dataset.decline, false)));
      }
    },
    async refreshLobby({ speak = false } = {}) {
      if (!this.serverReady() || this.local) { this.renderLobby(); if (speak) this.say(tr('hall.needOnline'), { wait: false }); return null; }
      const r = await window.BSUServer.call('hall_poll', { name: this.heroName() });
      if (!r || !r.ok) { if (speak) this.fail(r); return r; }
      const picked = new Set([...document.querySelectorAll('[name="h755-friend"]:checked')].map(el => el.value));
      this.lobby = { players: r.players || [], invites: r.invites || [], me: r.me };
      if (this.view && this.match && this.match.status !== 'finished') return r;
      if (r.match && !this.view) { await this.resume(r.match.id); return r; }
      this.renderLobby();
      document.querySelectorAll('[name="h755-friend"]').forEach(el => { if (picked.has(el.value) && !el.disabled) el.checked = true; });
      for (const invite of this.lobby.invites) {
        if (this.announcedInvites.has(invite.match_id)) continue;
        this.announcedInvites.add(invite.match_id);
        this.sound('board-turn');
        this.say(tr('hall.invite.got', { host: invite.host, game: tr('hall.game.' + invite.game) }), { wait: false });
      }
      if (speak && !this.lobby.players.length) this.say(tr('hall.nobody'), { wait: false });
      return r;
    },

    /* ───── starting, joining, resuming ───── */
    async createMatch(mode) {
      if (this.acting) return;
      const game = this.type, args = { game, mode, name: this.heroName() };
      if (game === 'snakes') { args.seats = Number($('h755-seats')?.value) || 2; args.color = $('h755-color')?.value || 'Blue'; }
      else { args.side = $('h755-side')?.value || 'white'; args.ai_level = Number($('h755-level')?.value) || 2; }
      if (mode === 'online') {
        if (!this.serverReady()) { this.sound('board-error'); return this.say(tr('hall.needOnline')); }
        args.invite = [...document.querySelectorAll('[name="h755-friend"]:checked')].map(el => el.value);
        if (!args.invite.length) { this.sound('board-error'); return this.say(tr(this.lobby.players.length ? 'hall.pickFriend' : 'hall.nobody')); }
        if (game === 'snakes') args.seats = Math.max(2, Math.min(4, args.invite.length + 1));
      }
      this.acting = true;
      try {
        this.local = null;
        let result = mode === 'ai' && !this.serverReady() ? null : await this.call('match_create', args);
        if (mode === 'ai' && (!result || (!result.ok && ['offline', 'network'].includes(result.error)))) {
          // Practice: the same rules, played in the browser, with no rewards.
          this.local = createLocalReferee(this.heroName());
          result = this.local.handle('match_create', args);
          await this.say(tr('hall.practice'));
        }
        if (!result.ok) { this.local = null; return this.fail(result); }
        this.begin(result);
        await this.take(result);
      } finally { this.acting = false; }
    },
    async respond(matchId, accept) {
      if (this.acting) return;
      this.acting = true;
      try {
        const result = await this.call('match_respond', { match_id: matchId, accept, color: $('h755-color')?.value || undefined, name: this.heroName() });
        this.lobby.invites = this.lobby.invites.filter(i => i.match_id !== matchId);
        if (!result.ok) { this.renderLobby(); return this.fail(result); }
        if (!accept) { this.renderLobby(); return; }
        this.begin(result);
        await this.take(result);
      } finally { this.acting = false; }
    },
    async resume(matchId) {
      const result = await this.call('match_state', { match_id: matchId, since: 0 });
      if (!result.ok) return;
      this.begin(result);
      this.seq = result.match.seq;
      this.syncShown();
      this.render();
      await this.say(tr('hall.resumed'));
      await this.describe();
      this.schedule();
    },
    begin(result) {
      this.view = { match: result.match, players: result.players, my_seat: result.my_seat };
      this.type = result.match.game; hall.type = this.type;
      this.seq = 0; this.selected = null; this.targets = [];
      this.shown = { pos: Array(result.match.seats).fill(0), turn: result.match.turn_seat, fen: START_FEN, last: null, offer: null };
      for (const id of ['hall-game-list', 'hall-setup', 'hall-help', 'hall-online-details']) { const el = $(id); if (el) { el.classList.add('hidden'); el.style.display = 'none'; } }
      $('hall-status').innerHTML = '';
    },
    syncShown() {
      const m = this.match; if (!m) return;
      if (m.game === 'snakes') { if (Array.isArray(m.state?.pos)) this.shown.pos = m.state.pos.slice(); }
      else if (m.state?.fen) { this.shown.fen = m.state.fen; this.shown.last = m.state.last || this.shown.last; this.shown.offer = m.state.draw_offer_seat ?? null; }
      this.shown.turn = m.turn_seat;
    },

    /** Take a server answer: show and speak each new event in order. */
    take(result) {
      this.chain = this.chain.then(async () => {
        if (!result || !result.ok || !result.match) return;
        if (this.view && result.match.id !== this.view.match.id) return;
        const fresh = (result.events || []).filter(e => e.seq > this.seq).sort((a, b) => a.seq - b.seq);
        this.view = { match: result.match, players: result.players, my_seat: result.my_seat };
        for (const e of fresh) {
          this.seq = e.seq;
          try { await this.present(e); } catch (error) { console.error('Game hall event failed', e.type, error); }
          await hall.pause(250);       // readable pacing when speech is off
        }
        this.syncShown();
        this.render();
        this.schedule();
      }).catch(error => console.error('Game hall update failed', error));
      return this.chain;
    },

    async present(e) {
      const d = e.data || {}, m = this.match, mine = d.seat === this.mySeat, key = suffix => suffix + (mine ? '.me' : '.other');
      switch (e.type) {
        case 'created': if (m.status === 'waiting') await this.say(tr('hall.waiting')); break;
        case 'invited': if (m.host) await this.say(tr('hall.invited', { name: d.name })); break;
        case 'joined': if (!mine) { await this.sound('board-turn'); await this.say(tr('hall.joined', { name: d.name })); } break;
        case 'rejected': await this.say(tr('hall.rejected', { name: d.name })); break;
        case 'cancelled': await this.say(tr('hall.cancelled')); break;
        case 'start':
          this.shown.turn = d.turn_seat;
          this.render();
          await this.sound('board-turn');
          await this.say(tr('hall.start'));
          if (m.game === 'chess') await this.say(tr('chess.youAre', { color: this.colorName(this.myColor()) }));
          await this.sayTurn(d.turn_seat);
          break;
        case 'roll': {
          const name = this.name(d.seat);
          await this.sound('board-dice', 1200);
          await this.say(tr(key('hall.roll'), { name, die: d.die }));
          if (d.landed === d.from) await this.say(tr(key('hall.exact'), { name, need: 100 - d.from, from: d.from }));
          else {
            // one step sound for each square travelled
            for (let square = d.from + 1; square <= d.landed; square++) { this.shown.pos[d.seat] = square; await this.sound('board-piece', 220); }
            this.render();
            await this.say(tr(key('hall.step'), { name, from: d.from, to: d.landed }));
            if (d.via === 'ladder') { await this.sound('ladder-up', 1400); this.shown.pos[d.seat] = d.to; this.render(); await this.say(tr(key('hall.ladder'), { name, from: d.landed, to: d.to })); }
            else if (d.via === 'snake') { await this.sound('snake-down', 1400); this.shown.pos[d.seat] = d.to; this.render(); await this.say(tr(key('hall.snake'), { name, from: d.landed, to: d.to })); }
          }
          this.shown.pos[d.seat] = d.to;
          if (d.rank != null) await this.say(tr(key('hall.home'), { name, rank: d.rank }));
          this.render();
          break;
        }
        case 'turn': this.shown.turn = d.seat; this.render(); await this.sayTurn(d.seat); break;
        case 'move': {
          this.shown.fen = d.fen; this.shown.last = { from: d.from, to: d.to, text: this.moveText(d) }; this.shown.turn = 1 - d.seat; this.shown.offer = null;
          this.selected = null; this.targets = [];
          this.render();
          await this.sound('board-piece', 500);
          await this.say(this.shown.last.text);
          if (!d.over && 1 - d.seat === this.mySeat) await this.sayTurn(this.mySeat);
          break;
        }
        case 'draw_offered': this.shown.offer = d.seat; this.render(); await this.sound('board-turn'); await this.say(tr(key('hall.draw.offer'), { name: this.name(d.seat) })); break;
        case 'draw_declined': this.shown.offer = null; this.render(); await this.say(tr('hall.draw.declined')); break;
        case 'draw_accepted': this.shown.offer = null; await this.say(tr('hall.draw.accepted')); break;
        case 'resigned': await this.say(tr('hall.resigned', { name: mine ? tr('hall.you') : this.name(d.seat) })); break;
        case 'left': if (!mine) await this.say(tr('hall.left', { name: this.name(d.seat) })); break;
        case 'away': if (!mine) await this.say(tr('hall.away', { name: this.name(d.seat) })); break;
        case 'back': if (!mine) await this.say(tr('hall.back', { name: this.name(d.seat) })); break;
        case 'finished': await this.finished(d); break;
        default: break;
      }
    },
    async sayTurn(seat) {
      if (this.match.status === 'finished') return;
      if (seat === this.mySeat) { await this.sound('board-turn'); await this.say(tr('hall.turn.me.' + this.match.game)); }
      else await this.say(tr('hall.turn.other', { name: this.name(seat) }));
    },
    moveText(d) {
      const color = this.colorName(d.color), parts = [];
      if (d.castle) parts.push(tr('chess.castle.' + d.castle, { color }));
      else if (d.captured) parts.push(tr('chess.capture', { color, piece: this.pieceName(d.piece), from: d.from, to: d.to, captured: this.pieceName(d.captured) }));
      else parts.push(tr('chess.move', { color, piece: this.pieceName(d.piece), from: d.from, to: d.to }));
      if (d.en_passant) parts.push(tr('chess.enpassant'));
      if (d.promotion) parts.push(tr('chess.promotes', { piece: this.pieceName(d.promotion) }));
      if (d.over === 'checkmate') parts.push(tr('hall.reason.checkmate'));
      else if (d.check) parts.push(tr('chess.check'));
      return parts.join(' ');
    },
    async finished(result) {
      const m = this.match, me = this.mySeat, rankings = result.rankings || [], mineRow = rankings.find(r => r.seat === me);
      this.stopTimers();
      this.selected = null; this.targets = [];
      m.status = 'finished'; m.result = result;
      this.render();
      let won = false, draw = false;
      const lines = [tr('hall.over')];
      if (m.game === 'snakes') {
        won = mineRow?.rank === 1;
        if (mineRow?.rank) lines.push(tr('hall.myPlace', { rank: mineRow.rank, n: rankings.length }));
        for (const row of rankings) if (row.rank) lines.push(tr('hall.place', { rank: row.rank, name: row.seat === me ? tr('hall.you') : row.name }));
      } else {
        draw = result.outcome === 'draw'; won = !draw && result.winner_seat === me;
        lines.push(tr(draw ? 'hall.draw' : won ? 'hall.win' : 'hall.lose'));
        const reason = ['left', 'disconnected'].includes(result.reason) && !won ? '' : TEXT['hall.reason.' + result.reason] ? tr('hall.reason.' + result.reason) : '';
        if (reason) lines.push(reason);
      }
      await this.sound(draw ? 'board-turn' : won ? 'game-win' : 'game-lose', 2500);
      await this.say(lines.join(' '));
      if (this.local) await this.say(tr('hall.reward.practice'));
      else if (mineRow?.capped) await this.say(tr('hall.reward.capped'));
      else if (mineRow && (mineRow.gold > 0 || mineRow.xp > 0)) await this.say(tr('hall.reward', { gold: mineRow.gold, xp: mineRow.xp }));
      else await this.say(tr('hall.reward.none'));
      if (!this.local) { try { await window.BSUServer?.claimRewards?.(); } catch (error) { /* paid on the next heartbeat */ } }
    },

    /* ───── actions ───── */
    fail(result) {
      const code = String(result?.error || 'network');
      const known = code === 'offline' ? 'hall.error.network' : TEXT['hall.error.' + code] ? 'hall.error.' + code : null;
      this.sound('board-error');
      if (code === 'not_your_turn' && this.match) return this.say(tr('hall.notYourTurn', { name: this.name(this.shown.turn) }));
      return this.say(known ? tr(known) : tr('hall.error.other', { code }));
    },
    myTurn() { return Boolean(this.match && this.match.status === 'active' && this.shown && this.shown.turn === this.mySeat); },
    async act(action, args = {}) {
      if (this.acting || !this.match) return false;
      this.acting = true; this.render();
      try {
        await this.chain;
        const result = await this.call(action, { match_id: this.match.id, since: this.seq, ...args });
        if (!result.ok) { await this.fail(result); return false; }
        await this.take(result);
        return true;
      } finally { this.acting = false; this.render(); }
    },
    async roll() {
      if (!this.match || this.match.game !== 'snakes' || this.match.status !== 'active') return false;
      if (!this.myTurn()) { this.sound('board-error'); await this.say(tr('hall.notYourTurn', { name: this.name(this.shown.turn) })); return false; }
      return this.act('snakes_roll');
    },
    async describe() {
      const m = this.match; if (!m) return;
      if (m.game === 'snakes') {
        await this.say(this.view.players.map(p => tr('hall.pos', { name: p.seat === this.mySeat ? tr('hall.you') : `${p.name} (${p.color})`, pos: this.shown.pos[p.seat] })).join('. ') + '.');
      } else {
        const chess = new Chess(this.shown.fen), lines = [];
        for (const color of ['w', 'b']) for (const piece of ['k', 'q', 'r', 'b', 'n', 'p']) {
          const squares = [];
          for (const row of chess.board()) for (const cell of row) if (cell && cell.color === color && cell.type === piece) squares.push(cell.square);
          if (squares.length) lines.push(`${this.colorName(color)} ${this.pieceName(piece)}: ${squares.sort().join(', ')}`);
        }
        await this.say(lines.join('. ') + '.');
      }
      if (m.status === 'active') await this.sayTurn(this.shown.turn);
    },
    myColor() { const m = this.match; return m && m.state && m.state.white_seat === this.mySeat ? 'w' : 'b'; },
    async square(sq) {
      const m = this.match;
      if (!m || m.game !== 'chess' || m.status !== 'active' || this.acting) return;
      if (!this.myTurn()) { this.sound('board-error'); return this.say(tr('hall.notYourTurn', { name: this.name(this.shown.turn) })); }
      const chess = new Chess(this.shown.fen);
      if (this.selected && this.targets.includes(sq)) return this.chessMove(this.selected, sq);
      if (this.selected === sq) { this.selected = null; this.targets = []; this.render(sq); return this.say(tr('chess.cancelled')); }
      const piece = chess.get(sq);
      if (!piece) { this.selected = null; this.targets = []; this.render(sq); return this.say(tr('chess.empty', { sq })); }
      if (piece.color !== this.myColor()) { return this.say(tr('chess.notYours', { sq, piece: this.pieceName(piece.type) })); }
      const moves = chess.moves({ square: sq, verbose: true });
      if (!moves.length) { this.sound('board-error'); return this.say(tr('chess.noMoves', { sq, piece: this.pieceName(piece.type) })); }
      this.selected = sq; this.targets = [...new Set(moves.map(move => move.to))];
      this.render(sq);
      const seen = new Set(), list = [];
      for (const move of moves) { if (seen.has(move.to)) continue; seen.add(move.to); list.push(move.captured ? tr('chess.takes', { sq: move.to, piece: this.pieceName(move.captured) }) : move.to); }
      return this.say(tr('chess.selected', { piece: this.pieceName(piece.type), sq, list: list.join(', ') }));
    },
    async chessMove(from, to, promotion) {
      if (!this.match || this.match.game !== 'chess' || this.match.status !== 'active') return false;
      if (!this.myTurn()) { this.sound('board-error'); await this.say(tr('hall.notYourTurn', { name: this.name(this.shown.turn) })); return false; }
      const chess = new Chess(this.shown.fen);
      const legal = chess.moves({ verbose: true }).some(move => move.from === from && move.to === to);
      if (!legal) { this.sound('board-error'); await this.say(tr('hall.error.illegal_move')); return false; }
      const done = await this.act('chess_move', { from, to, promotion: promotion || $('h755-promo')?.value || 'q' });
      if (done) { const next = document.querySelector(`[data-sq="${to}"]`); if (next) next.focus(); }
      return done;
    },
    typedMove(text) {
      const found = /^\s*(?:move\s+)?([a-h][1-8])\s*(?:to|-|x)?\s*([a-h][1-8])\s*=?\s*([qrbn])?\s*$/i.exec(String(text || ''));
      if (!found) { this.sound('board-error'); this.say(tr('chess.typed')); return false; }
      return this.chessMove(found[1].toLowerCase(), found[2].toLowerCase(), found[3] ? found[3].toLowerCase() : undefined);
    },
    confirm(title, body, yesLabel) {
      return new Promise(resolve => {
        const dialog = $('confirm-dialog'), yes = $('confirm-dialog-yes'), no = $('confirm-dialog-no');
        if (!dialog || !yes || !no) { resolve(typeof window.confirm === 'function' ? window.confirm(body) : true); return; }
        const previous = document.activeElement, oldYes = yes.textContent;
        $('confirm-dialog-title').textContent = title; $('confirm-dialog-body').textContent = body; yes.textContent = yesLabel;
        dialog.classList.remove('hidden');
        window.AudioManager?.playVoice?.(`${title} ${body}`);
        setTimeout(() => no.focus(), 0);
        const done = ok => {
          dialog.classList.add('hidden'); yes.textContent = oldYes;
          yes.removeEventListener('click', onYes); no.removeEventListener('click', onNo); dialog.removeEventListener('keydown', onKey);
          try { previous?.focus?.(); } catch (error) { /* element is gone */ }
          resolve(ok);
        };
        const onYes = () => done(true), onNo = () => done(false), onKey = ev => { if (ev.key === 'Escape') { ev.preventDefault(); done(false); } };
        yes.addEventListener('click', onYes); no.addEventListener('click', onNo); dialog.addEventListener('keydown', onKey);
      });
    },
    /** Leave the game. An unfinished game always asks first. Returns true when the player left. */
    async leave() {
      const m = this.match;
      if (!m) return true;
      if (m.status === 'active' || m.status === 'waiting') {
        const ok = await this.confirm(tr('hall.leave.title'), tr(m.status === 'active' ? 'hall.leave.active' : 'hall.leave.waiting'), tr('hall.leave.yes'));
        if (!ok) { await this.say(tr('hall.leave.kept')); return false; }
        const wasActive = m.status === 'active';
        const result = await this.call('match_leave', { match_id: m.id, since: this.seq });
        if (result.ok && wasActive && result.match) await this.take(result);
        else await this.say(tr('hall.leave.done'));
      }
      this.close();
      return true;
    },
    async resign() {
      if (!this.match || this.match.status !== 'active') return false;
      if (!await this.confirm(tr('hall.resign.title'), tr('hall.resign.body'), tr('hall.resign.yes'))) { await this.say(tr('hall.leave.kept')); return false; }
      return this.act('chess_action', { do: 'resign' });
    },
    /** Back to the list of games. */
    close() {
      const type = this.type;
      this.stopTimers();
      this.view = null; this.local = null; this.shown = null; this.seq = 0; this.selected = null; this.targets = [];
      const help = $('hall-help'); if (help) { help.classList.remove('hidden'); help.style.display = ''; }
      if (type) this.showSetup(type);
    },

    /* ───── keeping an online game up to date ───── */
    async poll() {
      const m = this.match;
      if (!m || this.local || m.status === 'finished' || m.status === 'cancelled') return;
      const result = await this.call('match_state', { match_id: m.id, since: this.seq });
      if (result && result.ok) await this.take(result);
    },
    stopTimers() { clearInterval(this.timers.match); clearInterval(this.timers.lobby); this.timers.match = this.timers.lobby = null; },
    schedule() {
      if (!this.autoPoll) return;
      const m = this.match, visible = () => { const panel = $('game-hall-panel'); return panel && !panel.classList.contains('hidden'); };
      const online = m && !this.local && m.mode === 'online' && (m.status === 'active' || m.status === 'waiting');
      if (online && !this.timers.match) this.timers.match = setInterval(() => { if (!this.acting) this.poll(); }, 2500);
      if (!online && this.timers.match) { clearInterval(this.timers.match); this.timers.match = null; }
      const lobby = !m && this.type;
      if (lobby && !this.timers.lobby) this.timers.lobby = setInterval(() => { if (visible() && !this.view) this.refreshLobby(); else if (!visible()) { clearInterval(this.timers.lobby); this.timers.lobby = null; } }, 6000);
      if (!lobby && this.timers.lobby) { clearInterval(this.timers.lobby); this.timers.lobby = null; }
    },

    /* ───── drawing ───── */
    render(focusSquare) {
      const m = this.match, board = $('hall-board'), controls = $('hall-controls');
      if (!m || !board || !controls) return;
      const active = m.status === 'active', mine = this.myTurn(), wait = this.acting ? ' disabled aria-disabled="true"' : '';
      const leaveLabel = m.status === 'finished' || m.status === 'cancelled' ? 'Back to the game list' : 'Leave game';
      let html = '';
      if (m.status === 'waiting') {
        board.innerHTML = `<ul class="h755-wait">${this.view.players.map(p => `<li>${esc(p.name)}: ${p.status === 'joined' ? 'ready' : p.status === 'invited' ? 'invited, waiting for an answer' : esc(p.status)}</li>`).join('')}</ul>`;
      } else if (m.game === 'snakes') {
        board.innerHTML = `<ul class="h755-positions" aria-label="Positions">${this.view.players.map(p => `<li${active && this.shown.turn === p.seat ? ' class="h755-turn"' : ''}>${esc(p.seat === this.mySeat ? `${tr('hall.you')} (${p.color})` : `${p.name} (${p.color})`)}: ${this.shown.pos[p.seat] ?? 0}${p.rank ? ` · place ${p.rank}` : ''}</li>`).join('')}</ul>`;
        if (active) html += `<button id="h755-roll" class="action-btn" type="button"${mine && !this.acting ? '' : ' aria-disabled="true"'}>${mine ? 'Roll the dice' : `Waiting for ${esc(this.name(this.shown.turn, { plain: true }))}`}</button>`;
      } else {
        const chess = new Chess(this.shown.fen), flip = this.myColor() === 'b';
        const files = flip ? 'hgfedcba' : 'abcdefgh', ranks = flip ? '12345678' : '87654321';
        let grid = '<table class="h755-chess" role="grid" aria-label="Chess board"><tbody>';
        for (const rank of ranks) {
          grid += '<tr role="row">';
          for (const file of files) {
            const sq = file + rank, piece = chess.get(sq), dark = (file.charCodeAt(0) - 97 + Number(rank)) % 2 === 1;
            const label = `${sq}, ${piece ? `${this.colorName(piece.color)} ${this.pieceName(piece.type)}` : tr('chess.sq.empty')}${this.selected === sq ? ', selected' : ''}${this.targets.includes(sq) ? ', legal move' : ''}`;
            const cls = `h755-sq ${dark ? 'dark' : 'light'}${this.selected === sq ? ' sel' : ''}${this.targets.includes(sq) ? ' tgt' : ''}${this.shown.last && (this.shown.last.from === sq || this.shown.last.to === sq) ? ' last' : ''}`;
            grid += `<td role="gridcell"><button type="button" class="${cls}" data-sq="${sq}" aria-label="${esc(label)}"${this.selected === sq ? ' aria-pressed="true"' : ''}>${piece ? GLYPH[piece.color + piece.type] : '·'}</button></td>`;
          }
          grid += '</tr>';
        }
        board.innerHTML = grid + '</tbody></table>';
        board.querySelectorAll('[data-sq]').forEach(button => button.addEventListener('click', () => this.square(button.dataset.sq)));
        if (active) {
          html += `<label>Move <input id="h755-move" placeholder="e2 e4" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false"></label><button id="h755-move-go" class="action-btn" type="button"${wait}>Play move</button>
            <label>Pawn becomes <select id="h755-promo"><option value="q">${esc(this.pieceName('q'))}</option><option value="r">${esc(this.pieceName('r'))}</option><option value="b">${esc(this.pieceName('b'))}</option><option value="n">${esc(this.pieceName('n'))}</option></select></label>
            <button id="h755-last" class="menu-btn" type="button">Last move</button>`;
          if (this.shown.offer != null && this.shown.offer !== this.mySeat) html += `<button id="h755-draw-yes" class="action-btn" type="button">Accept draw</button><button id="h755-draw-no" class="menu-btn" type="button">Decline draw</button>`;
          else if (this.shown.offer == null) html += `<button id="h755-draw" class="menu-btn" type="button"${wait}>Offer draw</button>`;
          html += `<button id="h755-resign" class="menu-btn" type="button"${wait}>Resign</button>`;
        }
      }
      if (m.status !== 'waiting') html += `<button id="h755-describe" class="menu-btn" type="button">${m.game === 'snakes' ? 'Where is everyone?' : 'Read the board'}</button>`;
      html += `<button id="h755-leave" class="menu-btn" type="button">${leaveLabel}</button>`;
      const promo = $('h755-promo')?.value, typed = $('h755-move')?.value, hadFocus = document.activeElement?.id;
      controls.innerHTML = html;
      if (promo && $('h755-promo')) $('h755-promo').value = promo;
      if (typed && $('h755-move')) $('h755-move').value = typed;
      const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
      on('h755-roll', () => this.roll());
      on('h755-describe', () => this.describe());
      on('h755-leave', () => this.leave());
      on('h755-move-go', () => { const input = $('h755-move'); const text = input.value; input.value = ''; this.typedMove(text); });
      on('h755-last', () => this.say(this.shown.last ? this.shown.last.text || `${this.shown.last.from} ${this.shown.last.to}` : tr('chess.last.none')));
      on('h755-draw', () => this.act('chess_action', { do: 'offer_draw' }));
      on('h755-draw-yes', () => this.act('chess_action', { do: 'accept_draw' }));
      on('h755-draw-no', () => this.act('chess_action', { do: 'decline_draw' }));
      on('h755-resign', () => this.resign());
      const moveInput = $('h755-move');
      if (moveInput) moveInput.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); const text = moveInput.value; moveInput.value = ''; this.typedMove(text); } });
      if (focusSquare) document.querySelector(`[data-sq="${focusSquare}"]`)?.focus();
      else if (hadFocus && $(hadFocus)) $(hadFocus).focus();
    }
  };

  /* Arrow keys move between squares, so the board can be explored like a grid. */
  document.addEventListener('keydown', ev => {
    const sq = ev.target?.dataset?.sq;
    if (!sq || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
    const flip = Play.match && Play.myColor() === 'b' ? -1 : 1;
    let file = sq.charCodeAt(0) - 97, rank = Number(sq[1]);
    if (ev.key === 'ArrowUp') rank += flip; if (ev.key === 'ArrowDown') rank -= flip;
    if (ev.key === 'ArrowRight') file += flip; if (ev.key === 'ArrowLeft') file -= flip;
    if (file < 0 || file > 7 || rank < 1 || rank > 8) return;
    ev.preventDefault();
    document.querySelector(`[data-sq="${String.fromCharCode(97 + file)}${rank}"]`)?.focus();
  });

  /* ───────────── wiring into the existing Game Hall ───────────── */
  const style = document.createElement('style');
  style.textContent = `
    .h755-setup{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .h755-setup fieldset{flex-basis:100%;border:1px solid var(--primary,#888);border-radius:8px;padding:10px}
    .h755-friend{display:block;padding:6px 0}
    .h755-positions,.h755-wait{list-style:none;padding:0;margin:0}
    .h755-positions li,.h755-wait li{padding:6px 8px}
    .h755-positions li.h755-turn{outline:2px solid #facc15;border-radius:6px}
    .h755-chess{border-collapse:collapse;margin:0 auto}
    .h755-chess td{padding:0}
    .h755-sq{width:min(11vw,52px);height:min(11vw,52px);font-size:min(8vw,34px);line-height:1;border:0;border-radius:0;padding:0;color:#111;cursor:pointer}
    .h755-sq.light{background:#f0d9b5}.h755-sq.dark{background:#b58863}
    .h755-sq.last{box-shadow:inset 0 0 0 3px #2563eb}
    .h755-sq.sel{box-shadow:inset 0 0 0 4px #dc2626}
    .h755-sq.tgt{box-shadow:inset 0 0 0 4px #16a34a}
    .h755-sq:focus-visible{outline:3px solid #facc15;outline-offset:-3px}
    #hall-controls [aria-disabled="true"]{opacity:.6}`;
  document.head.appendChild(style);

  const legacySelect = hall.select.bind(hall);
  hall.select = function (type) {
    if (Play.match && Play.match.status !== 'finished' && Play.match.status !== 'cancelled') {
      // A game is in progress: changing game means leaving it, which always asks first.
      Play.leave().then(left => { if (left) hall.select(type); });
      return;
    }
    if (type === 'snakes' || type === 'chess') { Play.view = null; Play.local = null; Play.showSetup(type); return; }
    Play.stopTimers(); Play.type = null; Play.view = null;
    for (const id of ['hall-setup', 'hall-help']) { const el = $(id); if (el) { el.classList.remove('hidden'); el.style.display = ''; } }
    legacySelect(type);
  };
  // The old friend-match code spoke to tables that no longer exist. Snakes & Ladders
  // and Chess now go through the game server; the other games are played locally.
  hall.loadInvites = async () => {};
  const details = $('hall-online-details');
  if (details) { details.classList.add('hidden'); details.style.display = 'none'; }
  const legacyOpen = hall.open.bind(hall);
  hall.open = function () {
    const playing = Play.match && Play.match.status !== 'finished';
    if (playing) { $('game-hall-panel').classList.remove('hidden'); Play.render(); Play.schedule(); return; }
    legacyOpen();
    if (!Play.type) Play.refreshLobbyQuietly();
  };
  /** Opening the hall resumes a game the player is still part of, and shows waiting invitations. */
  Play.refreshLobbyQuietly = async function () {
    if (!this.serverReady()) return;
    const r = await window.BSUServer.call('hall_poll', { name: this.heroName() });
    if (!r || !r.ok) return;
    this.lobby = { players: r.players || [], invites: r.invites || [], me: r.me };
    if (r.match && !this.view) { await this.resume(r.match.id); return; }
    if (this.lobby.invites.length && !this.type) this.showSetup(this.lobby.invites[0].game);
  };
  // The panel's Close button must not silently abandon a game.
  const closeButton = document.querySelector('#game-hall-panel .close-btn');
  if (closeButton) {
    closeButton.removeAttribute('onclick');
    closeButton.addEventListener('click', async () => {
      if (Play.match && (Play.match.status === 'active' || Play.match.status === 'waiting')) { if (!await Play.leave()) return; }
      Play.stopTimers();
      if (Play.serverReady()) window.BSUServer.call('hall_poll', { leave: true });
      $('game-hall-panel').classList.add('hidden');
    });
  }

  // Typed and spoken commands while a game is on the table.
  const previousCommand = window.Game.processCommand.bind(window.Game);
  window.Game.processCommand = function (command) {
    const text = String(command || '').toLowerCase().trim(), m = Play.match, panel = $('game-hall-panel');
    if (m && panel && !panel.classList.contains('hidden') && m.status !== 'cancelled') {
      if (m.game === 'snakes' && ['roll', 'roll dice', 'roll the dice', 'dice'].includes(text)) { Play.roll(); return; }
      if (['positions', 'where is everyone', 'board', 'read board', 'read the board'].includes(text)) { Play.describe(); return; }
      if (['leave game', 'quit game', 'exit game'].includes(text)) { Play.leave(); return; }
      if (m.game === 'chess') {
        if (text === 'resign') { Play.resign(); return; }
        if (text === 'offer draw') { Play.act('chess_action', { do: 'offer_draw' }); return; }
        if (text === 'accept draw') { Play.act('chess_action', { do: 'accept_draw' }); return; }
        if (text === 'decline draw') { Play.act('chess_action', { do: 'decline_draw' }); return; }
        if (text === 'last move') { Play.say(Play.shown.last ? Play.shown.last.text : tr('chess.last.none')); return; }
        if (/^(?:move\s+)?[a-h][1-8]\s*(?:to|-|x)?\s*[a-h][1-8]/.test(text)) { Play.typedMove(text); return; }
      }
    }
    return previousCommand(command);
  };

  window.HallPlay = Play;
})();
