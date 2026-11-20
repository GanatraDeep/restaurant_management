import type {
  ChecklistTemplateDto,
  ComplianceDto,
  LText,
  PlaybookDto,
  SopDto,
} from '@nodedr-restaurant/types';

// Starter content so a new kitchen doesn't open an empty app. Owners copy
// what they want and then change quantities to match their own recipe.

const L = (en: string, hi?: string, gu?: string): LText => ({ en, hi, gu });
const JAIN_OMIT = { JAIN: { omit: true } };

export interface StarterSop extends SopDto {
  key: string;
}

export const STARTER_SOPS: StarterSop[] = [
  {
    key: 'paneer-butter-masala',
    title: L('Paneer Butter Masala', 'पनीर बटर मसाला', 'પનીર બટર મસાલા'),
    category: 'Main course',
    yieldText: '1 portion (300 g)',
    prepMinutes: 15,
    variants: ['JAIN'],
    ingredients: [
      { name: L('Paneer cubes', 'पनीर के टुकड़े', 'પનીરના ટુકડા'), qty: '120', unit: 'g' },
      { name: L('Makhani gravy (base)', 'मखनी ग्रेवी (बेस)', 'મખની ગ્રેવી (બેઝ)'), qty: '180', unit: 'ml',
        variants: { JAIN: { text: L('Jain makhani gravy (no onion-garlic)', 'जैन मखनी ग्रेवी (बिना प्याज़-लहसुन)', 'જૈન મખની ગ્રેવી (કાંદા-લસણ વગર)') } } },
      { name: L('Butter', 'मक्खन', 'માખણ'), qty: '20', unit: 'g' },
      { name: L('Fresh cream', 'फ्रेश क्रीम', 'ફ્રેશ ક્રીમ'), qty: '20', unit: 'ml' },
      { name: L('Kasuri methi', 'कसूरी मेथी', 'કસૂરી મેથી'), qty: '1', unit: 'pinch' },
      { name: L('Ginger-garlic paste', 'अदरक-लहसुन पेस्ट', 'આદુ-લસણ પેસ્ટ'), qty: '5', unit: 'g', variants: JAIN_OMIT },
      { name: L('Sugar / honey', 'चीनी / शहद', 'ખાંડ / મધ'), qty: '5', unit: 'g',
        variants: { JAIN: { text: L('Sugar only (no honey)', 'सिर्फ चीनी (शहद नहीं)', 'ફક્ત ખાંડ (મધ નહીં)') } } },
    ],
    steps: [
      { text: L('Heat butter in a pan on medium flame.', 'मध्यम आँच पर पैन में मक्खन गरम करें।', 'મધ્યમ તાપે પેનમાં માખણ ગરમ કરો.'), minutes: 1 },
      { text: L('Add ginger-garlic paste and sauté for 30 seconds.', 'अदरक-लहसुन पेस्ट डालकर 30 सेकंड भूनें।', 'આદુ-લસણ પેસ્ટ નાખી 30 સેકન્ડ સાંતળો.'), variants: JAIN_OMIT },
      { text: L('Add makhani gravy and bring to a simmer.', 'मखनी ग्रेवी डालें और हल्का उबाल आने दें।', 'મખની ગ્રેવી નાખી હળવો ઉભરો આવવા દો.'), minutes: 3,
        variants: { JAIN: { text: L('Add Jain makhani gravy (from the Jain container) and simmer.', 'जैन डिब्बे से जैन मखनी ग्रेवी डालें और उबालें।', 'જૈન ડબ્બામાંથી જૈન મખની ગ્રેવી નાખી ઉકાળો.') } } },
      { text: L('Add paneer cubes and cook for 2 minutes without breaking them.', 'पनीर डालें और टूटने न दें, 2 मिनट पकाएँ।', 'પનીર નાખો, ભાંગે નહીં એ રીતે 2 મિનિટ રાંધો.'), minutes: 2 },
      { text: L('Finish with cream, crushed kasuri methi and sugar. Taste for salt.', 'क्रीम, मसली कसूरी मेथी और चीनी डालें। नमक चखें।', 'ક્રીમ, મસળેલી કસૂરી મેથી અને ખાંડ નાખો. મીઠું ચાખો.'), critical: true },
    ],
    packaging: [
      { name: L('500 ml round container with lid', '500 ml गोल डिब्बा ढक्कन सहित', '500 ml ગોળ ડબ્બો ઢાંકણ સાથે'), qty: '1' },
      { name: L('Tamper-proof sticker', 'टैम्पर-प्रूफ स्टिकर', 'ટેમ્પર-પ્રૂફ સ્ટીકર'), qty: '1' },
    ],
    accompaniments: [
      { name: L('Onion-lemon salad', 'प्याज़-नींबू सलाद', 'કાંદા-લીંબુ સલાડ'), qty: '1 small cup' },
    ],
    plating: L('Swirl of cream on top, 2 paneer cubes visible, coriander leaf.', 'ऊपर क्रीम का घुमाव, 2 पनीर के टुकड़े दिखें, धनिया पत्ता।', 'ઉપર ક્રીમનો વળાંક, 2 પનીર ટુકડા દેખાય, કોથમીર પાન.'),
    quiz: [
      { q: L('Which gravy is used for a Jain order?', 'जैन ऑर्डर के लिए कौन-सी ग्रेवी?', 'જૈન ઓર્ડર માટે કઈ ગ્રેવી?'),
        options: [L('Regular makhani', 'सामान्य मखनी', 'સામાન્ય મખની'), L('Jain makhani (no onion-garlic)', 'जैन मखनी (बिना प्याज़-लहसुन)', 'જૈન મખની (કાંદા-લસણ વગર)')], answer: 1 },
      { q: L('How much paneer goes in one portion?', 'एक पोर्शन में कितना पनीर?', 'એક પોર્શનમાં કેટલું પનીર?'),
        options: [L('80 g'), L('120 g'), L('200 g')], answer: 1 },
    ],
  },
  {
    key: 'dal-tadka',
    title: L('Dal Tadka', 'दाल तड़का', 'દાળ તડકા'),
    category: 'Main course',
    yieldText: '1 portion (300 ml)',
    prepMinutes: 10,
    variants: ['JAIN'],
    ingredients: [
      { name: L('Boiled toor dal', 'उबली तुअर दाल', 'બાફેલી તુવેર દાળ'), qty: '250', unit: 'ml' },
      { name: L('Ghee', 'घी', 'ઘી'), qty: '15', unit: 'g' },
      { name: L('Cumin seeds', 'जीरा', 'જીરું'), qty: '1', unit: 'tsp' },
      { name: L('Chopped onion', 'कटा प्याज़', 'સમારેલા કાંદા'), qty: '30', unit: 'g', variants: { JAIN: { text: L('Chopped tomato', 'कटा टमाटर', 'સમારેલા ટામેટા') } } },
      { name: L('Garlic, chopped', 'कटा लहसुन', 'સમારેલું લસણ'), qty: '5', unit: 'g', variants: JAIN_OMIT },
      { name: L('Hing (asafoetida)', 'हींग', 'હિંગ'), qty: '1', unit: 'pinch' },
      { name: L('Red chilli powder', 'लाल मिर्च पाउडर', 'લાલ મરચું પાવડર'), qty: '1/2', unit: 'tsp' },
    ],
    steps: [
      { text: L('Heat the boiled dal with salt and turmeric; adjust thickness with hot water.', 'उबली दाल को नमक-हल्दी के साथ गरम करें; गरम पानी से गाढ़ापन ठीक करें।', 'બાફેલી દાળને મીઠું-હળદર સાથે ગરમ કરો; ગરમ પાણીથી ઘટ્ટતા સરખી કરો.'), minutes: 3 },
      { text: L('Heat ghee in a tadka pan, add cumin and hing.', 'तड़का पैन में घी गरम कर जीरा और हींग डालें।', 'વઘારિયામાં ઘી ગરમ કરી જીરું અને હિંગ નાખો.') },
      { text: L('Add garlic and onion; fry till golden.', 'लहसुन और प्याज़ डालकर सुनहरा होने तक भूनें।', 'લસણ અને કાંદા નાખી સોનેરી થાય ત્યાં સુધી સાંતળો.'), minutes: 2,
        variants: { JAIN: { text: L('Add chopped tomato and cook till soft (no onion, no garlic).', 'कटा टमाटर डालकर नरम होने तक पकाएँ (प्याज़-लहसुन नहीं)।', 'સમારેલા ટામેટા નાખી નરમ થાય ત્યાં સુધી રાંધો (કાંદા-લસણ નહીં).') } } },
      { text: L('Switch off the flame, add chilli powder and pour the tadka over the dal immediately.', 'आँच बंद करें, मिर्च पाउडर डालें और तुरंत तड़का दाल पर डालें।', 'ગેસ બંધ કરો, મરચું નાખી તરત વઘાર દાળ પર રેડો.'), critical: true },
    ],
    packaging: [{ name: L('500 ml round container with lid', '500 ml गोल डिब्बा ढक्कन सहित', '500 ml ગોળ ડબ્બો ઢાંકણ સાથે'), qty: '1' }],
    accompaniments: [],
    plating: L('Tadka visible on top, coriander leaves.', 'ऊपर तड़का दिखे, धनिया पत्ते।', 'ઉપર વઘાર દેખાય, કોથમીર.'),
    quiz: [
      { q: L('What replaces onion in Jain dal tadka?', 'जैन दाल तड़का में प्याज़ की जगह क्या?', 'જૈન દાળ તડકામાં કાંદાને બદલે શું?'),
        options: [L('Potato', 'आलू', 'બટાકા'), L('Tomato', 'टमाटर', 'ટામેટા'), L('Garlic', 'लहसुन', 'લસણ')], answer: 1 },
    ],
  },
  {
    key: 'jeera-rice',
    title: L('Jeera Rice', 'जीरा राइस', 'જીરા રાઈસ'),
    category: 'Rice',
    yieldText: '1 portion (250 g)',
    prepMinutes: 5,
    variants: [],
    ingredients: [
      { name: L('Cooked basmati rice', 'पका बासमती चावल', 'રાંધેલા બાસમતી ચોખા'), qty: '220', unit: 'g' },
      { name: L('Ghee', 'घी', 'ઘી'), qty: '10', unit: 'g' },
      { name: L('Cumin seeds', 'जीरा', 'જીરું'), qty: '1', unit: 'tsp' },
    ],
    steps: [
      { text: L('Heat ghee, add cumin and let it crackle.', 'घी गरम कर जीरा डालें और चटकने दें।', 'ઘી ગરમ કરી જીરું નાખી તતડવા દો.') },
      { text: L('Add rice and salt; toss gently so grains do not break.', 'चावल और नमक डालें; धीरे से मिलाएँ ताकि दाने न टूटें।', 'ભાત અને મીઠું નાખો; દાણા ન ભાંગે એ રીતે હળવેથી હલાવો.'), minutes: 2 },
      { text: L('Serve hot. Rice held over 2 hours must not be used.', 'गरम परोसें। 2 घंटे से पुराना चावल इस्तेमाल न करें।', 'ગરમ પીરસો. 2 કલાકથી જૂના ભાતનો ઉપયોગ ન કરવો.'), critical: true },
    ],
    packaging: [{ name: L('500 ml rectangular container', '500 ml आयताकार डिब्बा', '500 ml લંબચોરસ ડબ્બો'), qty: '1' }],
    accompaniments: [],
    quiz: [],
  },
  {
    key: 'masala-chai',
    title: L('Masala Chai', 'मसाला चाय', 'મસાલા ચા'),
    category: 'Beverages',
    yieldText: '1 cup (150 ml)',
    prepMinutes: 5,
    variants: ['VEGAN'],
    ingredients: [
      { name: L('Water', 'पानी', 'પાણી'), qty: '80', unit: 'ml' },
      { name: L('Milk', 'दूध', 'દૂધ'), qty: '90', unit: 'ml', variants: { VEGAN: { text: L('Oat milk', 'ओट मिल्क', 'ઓટ મિલ્ક') } } },
      { name: L('Tea leaves', 'चायपत्ती', 'ચાની ભૂકી'), qty: '1', unit: 'tsp' },
      { name: L('Sugar', 'चीनी', 'ખાંડ'), qty: '2', unit: 'tsp' },
      { name: L('Chai masala / crushed ginger', 'चाय मसाला / कुटा अदरक', 'ચા મસાલો / ખાંડેલું આદુ'), qty: '1', unit: 'pinch' },
    ],
    steps: [
      { text: L('Boil water with tea leaves, sugar and masala for 1 minute.', 'पानी में चायपत्ती, चीनी और मसाला डालकर 1 मिनट उबालें।', 'પાણીમાં ચાની ભૂકી, ખાંડ અને મસાલો નાખી 1 મિનિટ ઉકાળો.'), minutes: 1 },
      { text: L('Add milk and boil twice (let it rise two times).', 'दूध डालें और दो उबाल आने दें।', 'દૂધ નાખી બે ઉભરા આવવા દો.'), minutes: 2,
        variants: { VEGAN: { text: L('Add oat milk and heat just to a simmer (do not boil hard).', 'ओट मिल्क डालें और बस हल्का गरम करें (तेज़ न उबालें)।', 'ઓટ મિલ્ક નાખી ફક્ત હળવું ગરમ કરો (જોરથી ન ઉકાળો).') } } },
      { text: L('Strain into the cup / flask.', 'कप / फ्लास्क में छान लें।', 'કપ / ફ્લાસ્કમાં ગાળી લો.') },
    ],
    packaging: [
      { name: L('250 ml paper cup with lid', '250 ml पेपर कप ढक्कन सहित', '250 ml પેપર કપ ઢાંકણ સાથે'), qty: '1' },
      { name: L('Stirrer + sugar sachet', 'स्टिरर + चीनी पाउच', 'સ્ટિરર + ખાંડ પાઉચ'), qty: '1' },
    ],
    accompaniments: [],
    quiz: [],
  },
  {
    key: 'chole',
    title: L('Chole Masala', 'छोले मसाला', 'છોલે મસાલા'),
    category: 'Main course',
    yieldText: '1 portion (300 g)',
    prepMinutes: 12,
    variants: ['JAIN'],
    ingredients: [
      { name: L('Boiled chickpeas', 'उबले छोले', 'બાફેલા છોલે'), qty: '180', unit: 'g' },
      { name: L('Onion-tomato masala', 'प्याज़-टमाटर मसाला', 'કાંદા-ટામેટા મસાલો'), qty: '100', unit: 'g',
        variants: { JAIN: { text: L('Tomato masala (no onion-garlic-ginger)', 'टमाटर मसाला (बिना प्याज़-लहसुन-अदरक)', 'ટામેટા મસાલો (કાંદા-લસણ-આદુ વગર)') } } },
      { name: L('Chole masala powder', 'छोले मसाला पाउडर', 'છોલે મસાલા પાવડર'), qty: '1', unit: 'tsp' },
      { name: L('Oil', 'तेल', 'તેલ'), qty: '15', unit: 'ml' },
    ],
    steps: [
      { text: L('Heat oil and add the masala base; cook till oil separates.', 'तेल गरम कर मसाला बेस डालें; तेल अलग होने तक पकाएँ।', 'તેલ ગરમ કરી મસાલા બેઝ નાખો; તેલ છૂટું પડે ત્યાં સુધી રાંધો.'), minutes: 3,
        variants: { JAIN: { text: L('Use the Jain tomato masala; add a pinch of hing first.', 'जैन टमाटर मसाला लें; पहले चुटकी हींग डालें।', 'જૈન ટામેટા મસાલો લો; પહેલાં ચપટી હિંગ નાખો.') } } },
      { text: L('Add chickpeas, chole masala, salt and 50 ml water; simmer.', 'छोले, छोले मसाला, नमक और 50 ml पानी डालकर उबालें।', 'છોલે, છોલે મસાલો, મીઠું અને 50 ml પાણી નાખી ઉકાળો.'), minutes: 5 },
      { text: L('Mash a few chickpeas to thicken. Check salt.', 'कुछ छोले मसलकर गाढ़ा करें। नमक जाँचें।', 'થોડા છોલે મસળી ઘટ્ટ કરો. મીઠું તપાસો.') },
    ],
    packaging: [{ name: L('500 ml round container with lid', '500 ml गोल डिब्बा ढक्कन सहित', '500 ml ગોળ ડબ્બો ઢાંકણ સાથે'), qty: '1' }],
    accompaniments: [
      { name: L('Sliced onion + lemon wedge', 'कटा प्याज़ + नींबू', 'સમારેલા કાંદા + લીંબુ'), qty: '1 cup' },
      { name: L('Green chutney', 'हरी चटनी', 'લીલી ચટણી'), qty: '30 ml' },
    ],
    quiz: [],
  },
  {
    key: 'veg-hakka-noodles',
    title: L('Veg Hakka Noodles', 'वेज हक्का नूडल्स', 'વેજ હક્કા નૂડલ્સ'),
    category: 'Chinese',
    yieldText: '1 portion (300 g)',
    prepMinutes: 8,
    variants: ['JAIN'],
    ingredients: [
      { name: L('Boiled noodles', 'उबले नूडल्स', 'બાફેલા નૂડલ્સ'), qty: '200', unit: 'g' },
      { name: L('Cabbage, capsicum, carrot (julienne)', 'पत्तागोभी, शिमला मिर्च, गाजर (लंबे कटे)', 'કોબી, કેપ્સીકમ, ગાજર (લાંબા સમારેલા)'), qty: '80', unit: 'g',
        variants: { JAIN: { text: L('Cabbage and capsicum only (no carrot)', 'सिर्फ पत्तागोभी और शिमला मिर्च (गाजर नहीं)', 'ફક્ત કોબી અને કેપ્સીકમ (ગાજર નહીં)') } } },
      { name: L('Spring onion, garlic', 'हरा प्याज़, लहसुन', 'લીલી ડુંગળી, લસણ'), qty: '15', unit: 'g', variants: JAIN_OMIT },
      { name: L('Soy sauce', 'सोया सॉस', 'સોયા સોસ'), qty: '10', unit: 'ml' },
      { name: L('Vinegar', 'सिरका', 'વિનેગર'), qty: '5', unit: 'ml' },
    ],
    steps: [
      { text: L('Heat the wok till it smokes, add oil and garlic.', 'कड़ाही को धुआँ आने तक गरम करें, तेल और लहसुन डालें।', 'કડાઈ ધુમાડો નીકળે ત્યાં સુધી ગરમ કરો, તેલ અને લસણ નાખો.'),
        variants: { JAIN: { text: L('Heat the wok till it smokes and add oil (no garlic).', 'कड़ाही गरम कर तेल डालें (लहसुन नहीं)।', 'કડાઈ ગરમ કરી તેલ નાખો (લસણ નહીં).') } } },
      { text: L('Add vegetables and toss on high flame for 1 minute — keep them crunchy.', 'सब्ज़ियाँ डालें और तेज़ आँच पर 1 मिनट टॉस करें — कुरकुरी रहें।', 'શાક નાખી ઊંચા તાપે 1 મિનિટ ટોસ કરો — કરકરા રહે.'), minutes: 1 },
      { text: L('Add noodles, soy sauce, vinegar, salt and pepper; toss well.', 'नूडल्स, सोया सॉस, सिरका, नमक और काली मिर्च डालकर अच्छी तरह टॉस करें।', 'નૂડલ્સ, સોયા સોસ, વિનેગર, મીઠું અને મરી નાખી સરખું ટોસ કરો.'), minutes: 2 },
      { text: L('Finish with spring onion greens.', 'ऊपर से हरे प्याज़ की पत्ती डालें।', 'ઉપરથી લીલી ડુંગળીના પાન નાખો.'), variants: JAIN_OMIT },
    ],
    packaging: [
      { name: L('750 ml container with lid', '750 ml डिब्बा ढक्कन सहित', '750 ml ડબ્બો ઢાંકણ સાથે'), qty: '1' },
      { name: L('Fork', 'काँटा', 'કાંટો'), qty: '1' },
    ],
    accompaniments: [{ name: L('Schezwan dip', 'शेज़वान डिप', 'શેઝવાન ડીપ'), qty: '30 ml' }],
    quiz: [],
  },
];

export const STARTER_CHECKLISTS: (ChecklistTemplateDto & { key: string })[] = [
  {
    key: 'opening',
    name: L('Kitchen opening', 'किचन खोलना', 'કિચન ખોલવું'),
    frequency: 'DAILY',
    dueTime: '10:00',
    items: [
      { id: 'gas', kind: 'CHECK', label: L('Gas line and burners checked, no leak smell', 'गैस लाइन और बर्नर जाँचे, गैस की गंध नहीं', 'ગેસ લાઈન અને બર્નર તપાસ્યા, ગેસની ગંધ નથી') },
      { id: 'fridge1', kind: 'TEMP', min: 1, max: 5, unit: '°C', label: L('Fridge temperature', 'फ्रिज का तापमान', 'ફ્રિજનું તાપમાન') },
      { id: 'freezer', kind: 'TEMP', min: -25, max: -18, unit: '°C', label: L('Freezer temperature', 'फ्रीज़र का तापमान', 'ફ્રીઝરનું તાપમાન') },
      { id: 'uniform', kind: 'CHECK', label: L('Staff in clean uniform, cap and gloves', 'स्टाफ साफ़ वर्दी, टोपी और दस्तानों में', 'સ્ટાફ સ્વચ્છ યુનિફોર્મ, ટોપી અને મોજામાં') },
      { id: 'surfaces', kind: 'CHECK', label: L('Work surfaces sanitised', 'काम की जगह सैनिटाइज़ की', 'કામની જગ્યા સેનિટાઈઝ કરી') },
      { id: 'expiry', kind: 'CHECK', label: L('Expired / spoiled stock removed', 'खराब / एक्सपायर्ड सामान हटाया', 'બગડેલો / એક્સપાયર્ડ માલ હટાવ્યો') },
    ],
  },
  {
    key: 'closing',
    name: L('Kitchen closing', 'किचन बंद करना', 'કિચન બંધ કરવું'),
    frequency: 'DAILY',
    dueTime: '23:30',
    items: [
      { id: 'gasoff', kind: 'CHECK', label: L('Gas main valve closed', 'गैस का मेन वाल्व बंद', 'ગેસનો મુખ્ય વાલ્વ બંધ') },
      { id: 'label', kind: 'CHECK', label: L('Leftover prep labelled with date and stored', 'बचा सामान तारीख लिखकर रखा', 'બચેલો માલ તારીખ લખીને રાખ્યો') },
      { id: 'fridge2', kind: 'TEMP', min: 1, max: 5, unit: '°C', label: L('Fridge temperature', 'फ्रिज का तापमान', 'ફ્રિજનું તાપમાન') },
      { id: 'floor', kind: 'CHECK', label: L('Floor, drains and exhaust cleaned', 'फर्श, नाली और एग्ज़ॉस्ट साफ़', 'ફ્લોર, ગટર અને એક્ઝોસ્ટ સાફ') },
      { id: 'garbage', kind: 'CHECK', label: L('Garbage taken out, bins washed', 'कचरा बाहर, डिब्बे धोए', 'કચરો બહાર, ડબ્બા ધોયા') },
    ],
  },
  {
    key: 'weekly-deep-clean',
    name: L('Weekly deep clean', 'साप्ताहिक गहरी सफ़ाई', 'સાપ્તાહિક ઊંડી સફાઈ'),
    frequency: 'WEEKLY',
    dueTime: null,
    items: [
      { id: 'chimney', kind: 'CHECK', label: L('Chimney filters degreased', 'चिमनी फ़िल्टर की चिकनाई साफ़', 'ચીમની ફિલ્ટરની ચીકાશ સાફ') },
      { id: 'fridgeclean', kind: 'CHECK', label: L('Fridge and freezer emptied and cleaned', 'फ्रिज-फ्रीज़र खाली कर साफ़ किया', 'ફ્રિજ-ફ્રીઝર ખાલી કરી સાફ કર્યું') },
      { id: 'pest', kind: 'CHECK', label: L('No signs of pests', 'कीड़ों-चूहों का कोई निशान नहीं', 'જીવાત-ઉંદરની કોઈ નિશાની નથી') },
      { id: 'tank', kind: 'CHECK', label: L('Water filter / RO checked', 'वॉटर फ़िल्टर / RO जाँचा', 'વોટર ફિલ્ટર / RO તપાસ્યું') },
    ],
  },
];

export const STARTER_PLAYBOOKS: PlaybookDto[] = [
  {
    channel: 'ZOMATO',
    title: L('Zomato orders', 'ज़ोमैटो ऑर्डर', 'ઝોમેટો ઓર્ડર'),
    sections: [
      { heading: L('When the order comes', 'ऑर्डर आने पर', 'ઓર્ડર આવે ત્યારે'), items: [
        L('Accept within 1 minute; set a prep time you can actually meet.', '1 मिनट में स्वीकार करें; वही समय रखें जो पूरा कर सकें।', '1 મિનિટમાં સ્વીકારો; એ જ સમય રાખો જે પૂરો કરી શકો.'),
        L('Read the cooking instructions and Jain / allergy notes out loud to the kitchen.', 'कुकिंग निर्देश और जैन / एलर्जी नोट किचन को पढ़कर सुनाएँ।', 'રસોઈ સૂચના અને જૈન / એલર્જી નોંધ કિચનને વાંચી સંભળાવો.'),
      ] },
      { heading: L('Packing', 'पैकिंग', 'પેકિંગ'), items: [
        L('Check every item against the KOT before sealing.', 'सील करने से पहले हर आइटम KOT से मिलाएँ।', 'સીલ કરતા પહેલાં દરેક આઈટમ KOT સાથે મેળવો.'),
        L('Tamper-proof sticker on the bag; cutlery and napkins only if asked.', 'बैग पर टैम्पर-प्रूफ स्टिकर; कटलरी-नैपकिन सिर्फ माँगने पर।', 'થેલી પર ટેમ્પર-પ્રૂફ સ્ટીકર; કટલરી-નેપકિન ફક્ત માંગે તો.'),
        L('Keep hot and cold items in separate bags.', 'गरम और ठंडे आइटम अलग बैग में।', 'ગરમ અને ઠંડી આઈટમ અલગ થેલીમાં.'),
      ] },
      { heading: L('Handover to rider', 'राइडर को देना', 'રાઈડરને આપવું'), items: [
        L('Match the order ID / OTP before handing over.', 'देने से पहले ऑर्डर ID / OTP मिलाएँ।', 'આપતા પહેલાં ઓર્ડર ID / OTP મેળવો.'),
        L('Mark the order "Ready" only when it is packed.', 'पैक होने पर ही ऑर्डर "Ready" करें।', 'પેક થાય ત્યારે જ ઓર્ડર "Ready" કરો.'),
      ] },
    ],
  },
  {
    channel: 'SWIGGY',
    title: L('Swiggy orders', 'स्विगी ऑर्डर', 'સ્વિગી ઓર્ડર'),
    sections: [
      { heading: L('When the order comes', 'ऑर्डर आने पर', 'ઓર્ડર આવે ત્યારે'), items: [
        L('Accept within 1 minute and start the KOT immediately.', '1 मिनट में स्वीकार करें और तुरंत KOT शुरू करें।', '1 મિનિટમાં સ્વીકારો અને તરત KOT શરૂ કરો.'),
        L('Out of stock? Mark the item off on Swiggy before rejecting the order.', 'स्टॉक नहीं? ऑर्डर रद्द करने से पहले स्विगी पर आइटम बंद करें।', 'સ્ટોક નથી? ઓર્ડર રદ કરતા પહેલાં સ્વિગી પર આઈટમ બંધ કરો.'),
      ] },
      { heading: L('Packing', 'पैकिंग', 'પેકિંગ'), items: [
        L('Use the dish SOP packaging list; gravy containers taped.', 'डिश SOP की पैकेजिंग सूची से पैक करें; ग्रेवी डिब्बे पर टेप।', 'ડિશ SOP ની પેકેજિંગ યાદી મુજબ પેક કરો; ગ્રેવી ડબ્બા પર ટેપ.'),
        L('Bill copy inside the bag.', 'बिल की कॉपी बैग के अंदर।', 'બિલની નકલ થેલીની અંદર.'),
      ] },
    ],
  },
  {
    channel: 'OWN_DELIVERY',
    title: L('Our own delivery', 'हमारी अपनी डिलीवरी', 'અમારી પોતાની ડિલિવરી'),
    sections: [
      { heading: L('Before leaving', 'निकलने से पहले', 'નીકળતા પહેલાં'), items: [
        L('Call the customer if the address is unclear.', 'पता साफ़ न हो तो ग्राहक को कॉल करें।', 'સરનામું સ્પષ્ટ ન હોય તો ગ્રાહકને ફોન કરો.'),
        L('Collect cash / check UPI status on the bill.', 'नकद लें / बिल पर UPI स्टेटस जाँचें।', 'રોકડ લો / બિલ પર UPI સ્ટેટસ તપાસો.'),
      ] },
    ],
  },
];

export const STARTER_COMPLIANCE: ComplianceDto[] = [
  { kind: 'LICENCE', name: 'FSSAI licence', remindDays: 60 },
  { kind: 'LICENCE', name: 'Fire NOC', remindDays: 60 },
  { kind: 'LICENCE', name: 'Shop & Establishment / Trade licence', remindDays: 45 },
  { kind: 'LICENCE', name: 'Health / eating-house licence', remindDays: 45 },
  { kind: 'AMC', name: 'Pest control AMC', remindDays: 15 },
  { kind: 'AMC', name: 'Fire extinguisher refill', remindDays: 30 },
  { kind: 'AMC', name: 'Exhaust / chimney cleaning', remindDays: 15 },
  { kind: 'AMC', name: 'Water purifier / RO AMC', remindDays: 15 },
  { kind: 'CERTIFICATE', name: 'Staff medical fitness certificates', remindDays: 30 },
];
