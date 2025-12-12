/**
 * TO DO:
 *   - implement book URI check
 */

let RECORDS = [];
let YEAR_INDEX = {};
let TOKEN_WEIGHTS = {};

///////////////////////////////////////////////////
// LOAD JSON CACHE
///////////////////////////////////////////////////
fetch("uri_data.json")
  .then(r => r.json())
  .then(data => {
    RECORDS = data.records.map(rec => ({
      ...rec,
      name_token_set: new Set(rec.name_parts)
    }));

    YEAR_INDEX = data.year_index;
    TOKEN_WEIGHTS = data.token_weights;
  });


  ///////////////////////////////////////////////////
// UTILITIES
///////////////////////////////////////////////////
function isValidAuthorURI(uri) {
  if (!/^(?:MS)?[0-9]{4}.*$/.test(uri)) {
    return "URI should start with four digits";
  } else {
    let invalidCharacters = uri.match(/[^0-9a-zA-Z]/g);
    console.log("invalid characters:"+invalidCharacters);
    if (invalidCharacters && invalidCharacters.length > 0){
        return "URI contains invalid characters: "+invalidCharacters;
    } else if (uri.length === 4){  // only date, no name:
        return "URI does not contain a name"
    }
    return "validAuthor";
  }
  //return /^\d{4}[A-Z][A-Za-z]*$/.test(uri);
}

function isValidBookURI(uri){
    let [authorUri, bookUri] = uri.split(".");
    // first check authof validity:
    let validAuthor = isValidAuthorURI(authorUri);
    if (validAuthor !== "validAuthor") return validAuthor;
    // then check title validity:
    let invalidCharacters = bookUri.match(/[^a-zA-Z]/g);
    console.log("invalid characters:"+invalidCharacters);
    if (invalidCharacters && invalidCharacters.length > 0){
        return "Book URI contains invalid characters: "+invalidCharacters;
    } else if (bookUri.trim().length === 0) {
        return "Title element in the book URI is absent";
    }
    return "validBook";
}

function isValidURI(uri) {
  const nPeriods = (uri.trim().match(/\./g)||[]).length
  if (nPeriods === 0) {
    return isValidAuthorURI(uri);
  } else if (nPeriods === 1){
    return isValidBookURI(uri);
  } else if (nPeriods > 1){
    return "Invalid URI: Too many periods";
  }
}


function parseAuthorURI(uri) {
  if (isValidURI(uri) !== "validAuthor") return null;

  const date = parseInt(uri.slice(0, 4));
  const uriName = uri.slice(4);

  // split at uppercase letters
  const rawParts = uriName.split(/(?=[A-Z])/).filter(p => p !== "");

  // merge logic can be added as needed — for now: keep raw parts.
  const name_parts = rawParts;

  return {
    uri,
    date,
    uriName,
    name_parts,
    uri_parts: name_parts,
    name_token_set: new Set(name_parts)
  };
}

function parseBookURI(uri) {
  if (isValidURI(uri) !== "validBook") return null;

  const [authorURI, title] = uri.split(".");
  const bookRec = parseAuthorURI(authorURI);

  // split at uppercase letters
  const rawParts = title.split(/(?=[A-Z])/).filter(p => p !== "");

  // merge logic can be added as needed — for now: keep raw parts.
  const title_parts = rawParts;

  bookRec.UriTitle = title;
  bookRec.title_parts = title_parts;
  bookRec.title_uri_parts = title_parts;
  bookRec.title_token_set = new Set(title_parts);

  return bookRec;
}

///////////////////////////////////////////////////
// TRANSLITERATION
///////////////////////////////////////////////////

function addCapitals(d){
    // add capital versions of each letter to the dictionary:
    for (var [char,repl] of Object.entries(d)){
        let Repl = repl.length > 0 ? repl[0].toUpperCase() : repl;
        let Char = char[0].toUpperCase();
        if (char[0] !== Char){               
            // First letter capitalized: e.g., "č" => "Č", "ch" => "Ch"
            Char += char.slice(1);
        } else if (char.length > 1) {        
            // First letter is not alphabetic: e.g., "_a", "^g"
            Char += char[1].toUpperCase();   //  =>    "_A", "^G"
        } 
        if (repl.length == 1 && repl[0] !== Repl){ 
            // First letter capitalized: e.g., "č" => "Č", "ch" => "Ch
            Repl += repl.slice(1);
        } else if (repl.length > 1) {        // e.g., "_a", "^g"
            Repl += repl[1].toUpperCase();   //  =>    "_A", "^G"
        }
        if (Char !== char) {
            d[Char] = Repl;
        }
    }
    return d;
}

var betacode2Translit = {
// Alphabet letters
    '_a' : 'ā', // alif
    'b'  : 'b', // bā’
    't'  : 't', // tā’
    '_t' : 'ṯ', // thā’
    '^g' : 'j', // jīm
    'ǧ'  : 'j', // jīm
    '^c' : 'č', // chīm / Persian
    '*h' : 'ḥ', // ḥā’
    '_h' : 'ḫ', // khā’
    'd'  : 'd', // dāl
    '_d' : 'ḏ', // dhāl
    'r'  : 'r', // rā’
    'z'  : 'z', // zayn
    's'  : 's', // sīn
    '^s' : 'š', // shīn
    '*s' : 'ṣ', // ṣād
    '*d' : 'ḍ', // ḍād
    '*t' : 'ṭ', // ṭā’
    '*z' : 'ẓ', // ẓā’
    '`'  : 'ʿ', // ‘ayn
    '*g' : 'ġ', // ghayn
    'f'  : 'f', // fā’
    '*k' : 'ḳ', // qāf
    'k'  : 'k', // kāf
    'g'  : 'g', // gāf / Persian
    'l'  : 'l', // lām
    'm'  : 'm', // mīm
    'n'  : 'n', // nūn
    'h'  : 'h', // hā’
    'w'  : 'w', // wāw
    '_u' : 'ū', // wāw
    'y'  : 'y', // yā’
    '_i' : 'ī', // yā’
// Non-alphabetic letters
    "'" : 'ʾ', // hamzaŧ
    '/a' : 'á', // alif maqṣūraŧ
    '=t' : 'ŧ', // tā’ marbūṭaŧ, this is preferable for Alpheios
// Vowels
    '~a' : 'ã', // dagger alif
    'u'  : 'u', // ḍammaŧ
    'i'  : 'i', // kasraŧ
    'a'  : 'a', // fatḥaŧ
    '?u'  : 'ủ', // ḍammaŧ
    '?i'  : 'ỉ', // kasraŧ
    '?a'  : 'ả', // fatḥaŧ
    '*n' : 'ȵ',   // n of tanwīn
    '*w' : 'ů',  // silent w, like in `Amru.n.w
    '*a' : 'å'  // silent alif, like in fa`al_u.a
};
betacode2Translit = addCapitals(betacode2Translit);

var translit2Arabic = {
// Alphabet letters
    'ā' : ' ا ',  // alif
    'b' : ' ب ',  // bāʾ
    't' : ' ت ',  // tāʾ
    'ṯ' : ' ث ', // thāʾ
    'ǧ' : ' ج ',  // jīm
    'j' : ' ج ',  // jīm
    'č' : ' چ ', // chīm / Persian
    'ḥ' : ' ح ',  // ḥāʾ
    'ḫ' : ' خ ', // khāʾ
    'd' : ' د ',  // dāl
    'ḏ' : ' ذ ', // dhāl
    'r' : ' ر ',  // rāʾ
    'z' : ' ز ',  // zayn
    's' : ' س ',  // sīn
    'š' : ' ش ', // shīn
    'ṣ' : ' ص ',  // ṣād
    'ḍ' : ' ض ',  // ḍād
    'ṭ' : ' ط ',  // ṭāʾ
    'ẓ' : ' ظ ',  // ẓāʾ
    'ʿ' : ' ع ',  // ʿayn
    'ġ' : ' غ ', // ghayn
    'f' : ' ف ',  // fā’
    'ḳ' : ' ق ',  // qāf
    'q' : ' ق ',  // qāf
    'k' : ' ك ',  // kāf
    'g' : ' گ ',  // gāf / Persian
    'l' : ' ل ',  // lām
    'm' : ' م ',  // mīm
    'n' : ' ن ',  // nūn
    'h' : ' ه ',  // hāʾ
    'w' : ' و ',  // wāw
    'ū' : ' و ',  // wāw
    'y' : ' ي ',  // yāʾ
    'ī' : ' ي ',  // yāʾ
// Non-alphabetic letters
    'ʾ' : ' ء ',  // hamza
    'á' : ' ٰى ',  // alif maqṣūraŧ
    'ŧ' : ' ة ',  // tāʾ marbūṭaŧ
// Vowels
    'ã'  : ' ٰ ',  // dagger alif
    'a'  : ' َ ',  // fatḥaŧ
    'u'  : ' ُ ',  // ḍammaŧ
    'i'  : ' ِ ',  // kasraŧ
    'aȵ' : ' ً ',  // tanwīn fatḥ
    'uȵ' : ' ٌ ',  // tanwīn ḍamm
    'iȵ' : ' ٍ ',  // tanwīn kasr
    'ů' : ' و ',  // silent w, like in `Amru.n.w
    'å' : ' ا ',  // silent alif, like in fa`al_u.a
    'ả' : ' َ ',  // final fatḥaŧ
    'ỉ' : ' ِ ',  // final ḍammaŧ
    'ủ' : ' ُ ',  // final kasraŧ
};
translit2Arabic = addCapitals(translit2Arabic);


var translit2uri = {
    "ʾ": "",
    "ṯ": "th",
    "ǧ": "j",
    "č": "ch",
    "ḥ": "h",
    "ḥ": "h",
    "ḫ": "kh",
    "ḏ": "dh",
    "š": "sh",
    "ṣ": "s",
    "ḍ": "d",
    "ṭ": "t",
    "ẓ": "zh",
    "ʿ": "c",
    "ġ": "gh",
    "ḳ": "q",
    "ā": "a",
    "ī": "i",
    "ū": "u",
    "ō": "o",
    "ē": "e",
};
translit2uri = addCapitals(translit2uri);


function dictReplace(text, d) {
    for (var [k,v] of Object.entries(d)) {
      k = k.trim();
      v = v.trim();
      //console.log(k+">"+v);
      //text = text.replace(k,v); // replaces only the first occurrence
      //kr = new RegExp(k, "g");
      //text = text.replace(kr,v); // does not work with k values starting with *
      text = text.split(k).join(v);
      //console.log(text);
      //console.log(k.toUpperCase()+">"+v.toUpperCase());
      //text = text.replace(k.toUpperCase(), v.toUpperCase()); // replaces only the first occurrence
      //kr = new RegExp(k.toUpperCase(), "g");
      //text = text.replace(kr, v.toUpperCase()); // does not work with k values starting with *
      text = text.split(k.toUpperCase()).join(v.toUpperCase());
      //console.log(text);
      if (k.length > 1) {
        k = k[0].toUpperCase()+k.slice(1,);
        //text = text.replace(k,v) // replaces only the first occurrence
        //kr = new RegExp(k, "g");
        //text = text.replace(kr,v); // does not work with k values starting with *
        text = text.split(k).join(v);
      }

      //console.log(text);
    }
    return text;
}

function removeSpacesAndUppercaseNext(text) {
    return text.replace(/ +([a-z])/g, (_, letter) => letter.toUpperCase())
               .replace(/[ -]+/g, "");
}

function countWords(text){
    return (text.trim().match(/ +/g) || []).length + 1
}

function translitToUri(text, maxWords=3){
    console.log("translitToUri "+text);
    // remove unwanted elements:
    text = text.replace(/[Aa]l-|\bKit[āa]b\b/g, " ");
    // convert letters:
    text = dictReplace(text, translit2uri).trim();
    // check the number of words in the each period-separated part of the text:
    console.log(text);
    let parts = [];
    for (let part of text.split(".")){
        if (countWords(part) > maxWords){
            // try splitting on wa- first:
            part = part.split(/ +wa-/g)[0];
            // if this is not enough, take only the first words
            if (countWords(part) > maxWords){
                part = part.split(/ +/g).slice(0, maxWords).join(" ");
            }
        }
        console.log(part);
        parts.push(part);
    }
    console.log(parts);
    text = parts.join(".");
    
    // make PascalCase:
    text = removeSpacesAndUppercaseNext(text);
    return text;
}

function betacodeToArabic(text) {
    var cnsnnts = "btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy";
    var cnsnnts = cnsnnts + cnsnnts.toUpperCase();

    // convert dates to Arabic
    const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
    const textArabicDigits = text.replace(/\d/g, (digit) => arabicDigits[digit]);
    text =  textArabicDigits.replace(/(\d+)\s*\/\s*(\d+)/g, "$1 هـ / $2 م");

    // deal with shadda:
    shadda = "  ّ  ".trim();
    // it must match only letters (not numbers nor underscore)
    text = text.replace(/([\p{L}])\1/gu, "$1" + shadda);

    // convert text:

    text = dictReplace(text, betacode2Translit);
    text = text.replace(/\+/g, "");

    // fix irrelevant variables for Arabic script
    text = text.toLowerCase();
    text = text.replace(/ủ/g, "u");
    text = text.replace(/ỉ/g, "i");
    text = text.replace(/ả/g, "a");

    // complex combinations
    text = text.replace(/all[āã]h[ua]?/g, "الله".trim()); // Convert God's Name
    text = text.replace(/li-?ll[āã]hi?/g, " لِـلّٰـهِ ".trim()); // Convert God's Name
    text = text.replace(/bi-?ll[āã]hi?/g, "بِاللهِ".trim()); // Convert God's Name
    text = text.replace(/wa-?ll[āã]hi?/g, "وَاللهِ".trim()); // Convert God's Name
    text = text.replace(/(?:(?<=[\s.,!?:\-])|^)b\./g, "بن"); // Convert b. into ar bn

    //var sun = "([tṯdḏrzsšṣḍṭẓln])";
    //var re = new RegExp("\b[aA]l-"+sun, "g");
    text = text.replace(/(?:(?<=[\s.,!?:\-])|^)[aA]l-([tṯdḏrzsšṣḍṭẓln])/g, 'ﭐل-$1$1'); // converts articles w/ sun letters
    text = text.replace(/(?:(?<=[\s.,!?:\-])|^)[aA]l-/g, "ﭐلْ-"); // converts articles
    text = text.replace(/(?:(?<=[\s.,!?:\-])|^)wa-a?l-/g, "وَﭐل-"); // converts articles

    // initial HAMZAs
    text = text.replace(/(?:(?<=[\s.,!?:\-])|^)ʾ?a/g, "أَ");
    text = text.replace(/(?:(?<=[\s.,!?:\-])|^)ʾi/g, "إِ");
    text = text.replace(/(?:(?<=[\s.,!?:\-])|^)i/g, "ﭐ");
    text = text.replace(/(?:(?<=[\s.,!?:\-])|^)ʾ?u/g, "أُ");
    text = text.replace(/(?:(?<=[\s.,!?:\-])|^)ʾ?ā/g, "آ");
    text = text.replace(/(?:(?<=[\s.,!?:\-])|^)ʾ?ī/g, "إِي");
    text = text.replace(/(?:(?<=[\s.,!?:\-])|^)ʾ?ū/g, "أُو");


    // final HAMZAs
  
    text = text.replace(/aʾ(?:(?=[\s.,!?:])|$)/g, "أ")
    text = text.replace(/uʾ(?:(?=[\s.,!?:])|$)/g, "ؤ")
    text = text.replace(/iʾ(?:(?=[\s.,!?:])|$)/g, "ئ")  
    text = text.replace(/yʾaȵ/g, "يْئًا");
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])ʾuȵ/g, '$1ْءٌ');
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])ʾiȵ/g, '$1ْءٍ');
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])ʾaȵ/g, '$1ْءًا');


    // short, hamza, tanwin
    text = text.replace(/uʾuȵ/g, "ُؤٌ");
    text = text.replace(/uʾiȵ/g, "ُؤٍ");
    text = text.replace(/uʾaȵ/g, "ُؤًا");

    text = text.replace(/iʾuȵ/g, "ِئٌ");
    text = text.replace(/iʾiȵ/g, "ِئٍ");
    text = text.replace(/iʾaȵ/g, "ِئًا");

    text = text.replace(/aʾuȵ/g, "َأٌ");
    text = text.replace(/aʾiȵ/g, "َأٍ");
    text = text.replace(/aʾaȵ/g, "َأً");

    // long, hamza, tanwin
    text = text.replace(/ūʾuȵ/g, "وءٌ");
    text = text.replace(/ūʾiȵ/g, "وءٍ");
    text = text.replace(/ūʾaȵ/g, "وءً");

    text = text.replace(/īʾuȵ/g, "يءٌ");
    text = text.replace(/īʾiȵ/g, "يءٍ");
    text = text.replace(/īʾaȵ/g, "يءً");

    text = text.replace(/āʾuȵ/g, "اءٌ");
    text = text.replace(/āʾiȵ/g, "اءٍ");
    text = text.replace(/āʾaȵ/g, "اءً");

    // long, hamza, diptote
    text = text.replace(/āʾu(?:(?=[\s.,!?:])|$)/g, "اءُ");
    text = text.replace(/āʾi(?:(?=[\s.,!?:])|$)/g, "اءِ");
    text = text.replace(/āʾa(?:(?=[\s.,!?:])|$)/g, "اءَ");

    // medial HAMZAs
    text = text.replace(/aʾū/g, "َؤُو");
    text = text.replace(/uʾa/g, "ُؤَ");
    text = text.replace(/uʾi/g, "ُئِ");

    text = text.replace(/ūʾu/g, "ُوؤُ");
    text = text.replace(/ūʾi/g, "ُوئِ");
    text = text.replace(/awʾa/g, "َوْءَ");
    text = text.replace(/awʾu/g, "َوْءُ");

    text = text.replace(/āʾi/g, "ائِ");
    text = text.replace(/aʾī/g, "َئِي");
    text = text.replace(/āʾī/g, "ائِي");
    text = text.replace(/āʾu/g, "اؤُ");
    text = text.replace(/uʾā/g, "ُؤَا");

    text = text.replace(/aʾa/g, "َأَ");
    text = text.replace(/aʾi/g, "َئِ");
    text = text.replace(/aʾu/g, "َؤُ");

    text = text.replace(/iʾu/g, "ِئُ");
    text = text.replace(/iʾi/g, "ِئِ");
    text = text.replace(/iʾa/g, "ِئَ");
    text = text.replace(/īʾa/g, "ِيئَ");
    text = text.replace(/īʾu/g, "ِيؤُ");
    text = text.replace(/iʾā/g, "ِئَا");

    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])ʾa/g, '$1ْأَ');
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])ʾu/g, '$1ْؤُ');
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])ʾū/g, '$1ْؤُ');
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])ʾi/g, '$1ْءٍ');

    text = text.replace(/uʾu/g, "ُؤُ");
    text = text.replace(/uʾū/g, "ُؤُو");

    text = text.replace(/aʾʾā/g, "َأَّا"); // geminnated hamza // dagger alif "َأّٰ", ordinary alif ""
    text = text.replace(/aʾī/g, "َئِي");
    text = text.replace(/āʾī/g, "ائِي");
    text = text.replace(/uʾā/g, "ُؤَا");

    text = text.replace(/uʾ([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])/g, 'ُؤْ$1');
    text = text.replace(/iʾ([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])/g, 'ِئْ$1');
    text = text.replace(/aʾ([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])/g, 'َأْ$1');

    text = text.replace(/aʾā/g, "َآ"); // madda: hamza, long a
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])ʾā/g, '$1ْآ'); // madda: sukun, hamza, long a

    // pronominal suffixes
    //text = text.replace("-(h[ui]|hā|k[ai]|h[ui]mā?|kumā|h[ui]nna|)\b", r"\1");
    // consonant combinations
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])\1/g, '$1ّ');
    // two consonants into C-sukun-C
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])/g, '$1ْ$2');
    //text = text.replace("([%s])([%s])" % (cnsnnts,cnsnnts), r"\1%s\2" % " ْ ".trim());
    // final consonant into C-sukun
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])(\s|$)/g, '$1ْ$2');
    // consonant + long vowel into C-shortV-longV
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])(ā)/g, '$1َ$2');
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])(ī)/g, '$1ِ$2');
    text = text.replace(/([btṯǧčḥḥḫdḏrzsšṣḍṭẓʿġfḳkglmnhwy])(ū)/g, '$1ُ$2');

    // tanwins
    text = text.replace(/([btṯǧḥḥḫdḏrzsšṣḍṭẓʿġfḳklmnhwy])aȵ/g, '$1اً');
    text = text.replace(/aȵ/g, ' ً '.trim());
    text = text.replace(/uȵ/g, ' ٌ '.trim());
    text = text.replace(/iȵ/g, ' ٍ '.trim());

    // silent letters
    text = text.replace(/ů/g, "و");
    text = text.replace(/å/g, "ا");
    text = dictReplace(text, translit2Arabic);

    text = text.replace(/ْ(?:(?=[\s.,!?:])|$)/g, ""); // replace final sukun
    text = text.replace(/,/g, "،"); // Convert commas
    text = text.replace(/-|_|ـ/g, "")

    return text;
}


function AHCE(dateAH) {
    let data = dateAH - dateAH / 33 + 622;
    return Math.round(data).toString();
}


function CEAH(dateCE) {
    let data = (33 / 32) * (dateCE - 622);
    return Math.round(data).toString();
}

function parseDate(dateStr, era) {
    if (dateStr.includes("/")) {  // e.g., 450/1058
        dateStr = dateStr.split("/")[0]; 
    }
    let dateNum = parseInt(dateStr.replace(/\D/g, ""), 10);

    return (era === "CE") ? CEAH(dateNum) : dateNum;
}

function checkUri(record={date: "", name: "", title: ""}){
    let uri = document.getElementById("uriInput").value.trim();
    console.log(uri);
    if (!uri){
        return buildUri();
    }
    const results = document.getElementById("results");
    results.innerHTML = "";

    let msg = isValidURI(uri);
    console.log(msg);
    if (msg !== "validAuthor" && msg !== "validBook") {
      results.innerHTML = `<p style='color:red;'>Invalid URI format: ${msg}</p>` ;
      return;
    }

    let uriType = msg.replace("valid", "");
    
    // first, get the data from the web page's input fields:
    //let record = getInputsData();
    console.log(record);

    // Then, enrich the record with parsed URI data:
    if (uriType === "Author"){
        let uriRecord = parseAuthorURI(uri);
        if (!uriRecord) {
            results.innerHTML = "<p style='color:red;'>Could not parse URI.</p>";
            return;
        } else {
            record = {...record, ...uriRecord};
            // split the name from the inputs and add it to the parts of the UriName:
            record.name_parts = [...record.name_parts, ...record.name.split(/[, ]+/g)]
            record.name_token_set = new Set([...record.name_parts]);
        }
    } else {
        let uriRecord = parseBookURI(uri);
        if (!uriRecord) {
            results.innerHTML = "<p style='color:red;'>Could not parse URI.</p>";
            return;
        } else {
            record = {...record, ...uriRecord};
            // split the name from the inputs and add it to the parts of the UriName:
            record.name_parts = [...record.name_parts, ...record.name.split(/[, ]+/g)];
            record.name_token_set = new Set([...record.name_parts]);
            // split the title from the inputs and add it to the parts of the UriTitle:
            record.title_parts = [...record.title_parts, ...record.title.split(/[, ]+/g)];
            record.title_token_set = new Set([...record.title_parts]);
        }
    }
    console.log(record);

    const allUris = RECORDS.map(r => r.uri);
    if (allUris.includes(uri)) {
      results.innerHTML += `<p style='color:red;'>URI ${uri} already exists in the corpus.</p>`;
      return;
    }
    const allBookUris = RECORDS.flatMap(r => Object.keys(r.books));
    if (allBookUris.includes(uri)) {
      results.innerHTML += `<p style='color:red;'>URI ${uri} already exists in the corpus.</p>`;
      return;
    }
    
    let authorMatches, matches;
    if (uriType === "Author"){
        matches = findPossibleDuplicates(record, uriType);
    } else {
        [authorMatches, matches] = findPossibleDuplicates(record, uriType);
    }
    //const matches = findPossibleDuplicates(record, uriType);
    console.log(authorMatches);
    let html;
    if (matches.length > 0){
        //html = "<h3>Closest URIs in the corpus:</h3><form>";
        html = "<h3>Closest URIs in the corpus:</h3>\n  <ul>\n";
        for (const m of matches) {
            //html += `<input type="radio" name="choice" value="${m}"> ${m}<br>`;
            html += `    <li>${m}</li>\n`;
        }
        html += "  </ul>\n"
        //html += `  </ul>\n<p>If none of the above is a likely candidate, use the newly coined URI: ${uri}</p>`;
        //html += `<input type="radio" name="choice" value="new">Create new URI</form>`;
        if (authorMatches){
            html += "<h3>Closest author URIs in the corpus:</h3>\n  <ul>\n";
            for (const m of authorMatches) {
                //html += `<input type="radio" name="choice" value="${m}"> ${m}<br>`;
                html += `    <li>${m}</li>\n`;
            }
            html += "  </ul>\n";
        }
        html += `<p>If none of the above is a likely candidate, use the newly coined URI: <strong>${uri}</strong></p>`;
    } else if (authorMatches){
        html = "<h3>No close book URI match found in the corpus. Closest author URIs:</h3>\n  <ul>\n";
        for (const m of authorMatches) {
            //html += `<input type="radio" name="choice" value="${m}"> ${m}<br>`;
            html += `    <li>${m}</li>\n`;
        }
        html += "  </ul>\n";
        
        html += `<p>If none of the above is a likely candidate, use the newly coined URI: <strong>${uri}</strong></p>`;
    } else {
        html = "<h3>The URI is valid, but no close matches are found in the corpus</h3>";
    }

    results.innerHTML += html;
}

/**
 * Gets data from the web page's input fields
 * @returns Object (keys: date, name, title)
 */
function getInputsData(){
    let date = document.getElementById("dateInput").value.trim();
    
    if (date != ""){
        const era = document.querySelector('input[name="dateEra"]:checked').value;
        date = parseDate(date, era);
        // pad with leading zeros
        date = String(date).padStart(4, '0');
        console.log(date);
    }
    
    const name = document.getElementById("nameInput").value.trim();
    const title = document.getElementById("titleInput").value.trim();
    return {date: date, name: name, title: title};

}

function reset(){
    const spans = ["arabicName", "arabicTitle", "draw-attention", "results"];
    const inputs = ["nameInput", "titleInput", "dateInput", "uriInput"];
    for (const id of spans){
        document.getElementById(id).innerHTML = "";
    }
    for (const id of inputs){
        document.getElementById(id).value = "";
    }
    document.getElementById("draw-attention").style.background="transparent";
}

function toggleTranscriptionTable(){
    const tt = document.getElementById("transcriptionTable");
    if (tt.style.display === "block"){
        tt.style.display = "none";
        document.getElementById("tableButton").innerHTML = "Conversion table";
    } else {
        tt.style.display = "block";
        document.getElementById("tableButton").innerHTML = "Hide conversion table";
    }
}

function buildUri(){
    const record = getInputsData();
    if (!record.date){
        const results = document.getElementById("results");
        results.innerHTML = "Please provide the author's death date";
        return;
    } if (!record.name){
        const results = document.getElementById("results");
        results.innerHTML = "Please provide the author's name";
        return;
    }

    let uri = record.date + record.name;
    if (record.name !== "") {
        // display the Arabic-script version of the author name:
        document.getElementById("arabicName").innerHTML = betacodeToArabic(record.name);
    }
    if (record.title !== ""){
        uri += "." + record.title
        // display the Arabic-script version of the book title:
        document.getElementById("arabicTitle").innerHTML = betacodeToArabic(record.title);
    }
    document.getElementById("draw-attention").innerHTML = "Check the conversion to Arabic script!";
    document.getElementById("draw-attention").style.background="orange";
    // create the URI:
    document.getElementById("uriInput").value = translitToUri(uri);
    //uriCheckButton.click();
    checkUri(record);
    return uri;
}

function isSubset(partsA, partsB, bothDirections=true){
    const sa = new Set(partsA);
    const sb = new Set(partsB);
    if (bothDirections && partsA.length > partsB.length) {
        return isSubset(partsB, partsA);
    }
    console.log("checking whether");
    console.log(sa);
    console.log("is a subset of");
    console.log(sb);
    for (const x of sa) {
        if (!sb.has(x)) return false;
    }
    return true;
}

///////////////////////////////////////////////////
// WEIGHTED JACCARD
///////////////////////////////////////////////////
/**
 * Score the similarity of names using a weighted Jaccard metric
 * (dividing the sum of the weights of the intersection of the scores for elements of both names 
 * by the union of the scores of all elements in both names)
 * The weights are derived based on inverse frequency of name elements 
 * in all author name elements in the corpus.
 * DOWNSIDE: score will be low if one name contains much more elements than the other
 * @param {Array} partsA : name parts in the first name
 * @param {Array} partsB : name parts in the second name
 * @param {Object} weights : frequency of each part in the corpus metadata
 * @returns Number
 */

function weightedJaccard(partsA, partsB, weights) {
  const sa = new Set(partsA);
  const sb = new Set(partsB);
  const inter = [...sa].filter(x => sb.has(x));
  const union = new Set([...sa, ...sb]);

  let num = 0;
  let den = 0;

  for (const t of inter) num += (weights[t] || 1);
  for (const t of union) den += (weights[t] || 1);

  return den === 0 ? 0 : num / den;
}

///////////////////////////////////////////////////
// WEIGHTED OVERLAP COEFFICIENT
///////////////////////////////////////////////////
/**
 * Score the similarity of names using a weighted overlap coefficient:
 * sum(weights of intersection) / min(sum(weights of A), sum(weights of B))
 * The weights are derived based on inverse frequency of name elements in all author name elements in the corpus
 * @param {Array} partsA : name parts in the first name
 * @param {Array} partsB : name parts in the second name
 * @param {Object} weights : frequency of each part in the corpus metadata
 * @returns 
 */
function weightedOverlap(partsA, partsB, weights) {
  const sa = new Set(partsA);
  const sb = new Set(partsB);

  const inter = [...sa].filter(x => sb.has(x));

  let interSum = 0;
  let sumA = 0;
  let sumB = 0;

  for (const t of inter) interSum += (weights[t] || 1);
  for (const t of sa) sumA += (weights[t] || 1);
  for (const t of sb) sumB += (weights[t] || 1);

  const minSum = Math.min(sumA, sumB);
  return minSum === 0 ? 0 : interSum / minSum;
}

///////////////////////////////////////////////////
// RARE SUBSET CHECK
///////////////////////////////////////////////////
function rareSubset(partsA, partsB, weights, threshold) {
  const sa = new Set(partsA);
  const sb = new Set(partsB);

  const rareA = new Set([...sa].filter(t => (weights[t] || 0) >= threshold));
  const rareB = new Set([...sb].filter(t => (weights[t] || 0) >= threshold));

  const small = rareA.size <= rareB.size ? rareA : rareB;
  const big = rareA.size <= rareB.size ? rareB : rareA;

  if (small.size === 0) return false;

  for (const t of small) {
    if (!big.has(t)) return false;
  }
  return true;
}

///////////////////////////////////////////////////
// MAIN MATCHING FUNCTION
///////////////////////////////////////////////////
function findPossibleDuplicates(
  record,
  uriType,
  max_year_diff = 10,
  same_year_wj_threshold = 0.4,
  close_year_wj_threshold = 0.5,
  rare_weight_threshold = 1.0
) {
  console.log(uriType);
  console.log(record);
  
  // filter the corpus author URI records by date:
  const year = record.date;
  const filteredYears = Object.keys(YEAR_INDEX)
    .map(x => parseInt(x))
    .filter(y => Math.abs(y - year) <= max_year_diff);

  let filteredRecords = [];
  for (const y of filteredYears) {
    for (const idx of YEAR_INDEX[y]) {
      filteredRecords.push(RECORDS[idx]);
    }
  }

  // find the most likely candidates from among these filtered records:
  let candidates = [];
  for (const r of filteredRecords) {

    // if both author URIs are identical: look no further
    if (r.uri === record.uri) {
      candidates = [r.uri,];
      break;
    }

    // if the two URIs have zero elements in common, don't bother comparing them:
    const intersection = [...record.name_token_set].filter(x => r.name_token_set.has(x));
    if (intersection.length === 0) continue;

    // if the author URIs are different, check if they are similar enough
    // (the metrics differ dependent on whether or not they have the same date)
    if (isSubset(record.uri_parts, r.uri_parts)) {
      candidates.push(r.uri);
    } else {
      const wj = weightedJaccard(record.name_parts, r.name_parts, TOKEN_WEIGHTS);
      const wo = weightedOverlap(record.name_parts, r.name_parts, TOKEN_WEIGHTS);
      const rare = rareSubset(record.name_parts, r.name_parts, TOKEN_WEIGHTS, rare_weight_threshold);

      console.log("author metrics: weighted Jaccard "+wj+", weighted overlap "+wo);

      if (r.date === record.date) {
        if (wj >= same_year_wj_threshold || wo >= same_year_wj_threshold || rare) {
          candidates.push(r.uri);
        } else {
          console.log("=> both are below the threshold "+same_year_wj_threshold);
        }
      } else {
        if (wj >= close_year_wj_threshold || wo >= close_year_wj_threshold || rare) {
          candidates.push(r.uri);
        } else {
          console.log("=> both are below the threshold "+close_year_wj_threshold);
        }
      }
    }
  }
  console.log(candidates);
  
  if (uriType === "Author"){
    return [...new Set(candidates)];
  }

  // for Book URIs, check the title part of th URI, too:
  let authorCandidates = [...new Set(candidates)];
  console.log(authorCandidates);
  let bookCandidates = [];
  const bookURI = `${record.uri}.${record.UriTitle}`
  console.log("bookURI: "+bookURI);
  console.log([...record.title_token_set]);
  
  for (const rec of RECORDS){
    // limit the search for candidates to those whose author URIs were identified as candidates:
    if (authorCandidates.includes(rec.uri)){
        console.log(rec.books);
        for (const recBookURI in rec.books){
            console.log(recBookURI);
            const book = rec.books[recBookURI];
            if (bookURI === recBookURI) bookCandidates.push(recBookURI);
            if (record.UriTitle === book.title_uri) bookCandidates.push(recBookURI);
            const bookTokenSet = new Set([...book.title_parts, ...book.uri_parts]);
            console.log(bookTokenSet);
            console.log(record.title_token_set)
            const intersection = [...record.title_token_set, ...record.title_token_set].filter(x => bookTokenSet.has(x));
            console.log(intersection);
            if (intersection.length === 0) continue;

            if (isSubset(record.title_uri_parts, book.uri_parts)) {
                bookCandidates.push(recBookURI);
            } else {
                // NB: problem of this weighted Jaccard approach is that
                // if more metadata is available, the weighted Jaccard score will be lower.
                const wj = weightedJaccard(record.title_parts, book.title_parts, TOKEN_WEIGHTS);
                // other approach: divide not by size of the union of both sets but by smallest set:
                const wo = weightedOverlap(record.title_parts, book.title_parts, TOKEN_WEIGHTS);
                const rare = rareSubset(record.title_parts, book.title_parts, TOKEN_WEIGHTS, rare_weight_threshold);
                console.log("Weighted Jaccard score: "+wj)
                if (wj >= same_year_wj_threshold || rare) {
                    bookCandidates.push(recBookURI);
                } else if (wo >= same_year_wj_threshold || rare) {
                    bookCandidates.push(recBookURI);
                } else {
                    console.log("Weighted Jaccard score "+wj+"is below the threshhold "+same_year_wj_threshold);
                }
            }

            
        }
    }
    
  }
  return [authorCandidates, [...new Set(bookCandidates)]];
  /*if (bookCandidates.length > 0){
    return [...new Set(bookCandidates)];
  }
  return authorCandidates;*/
}

///////////////////////////////////////////////////
// UI FUNCTION
///////////////////////////////////////////////////
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("dateInput").addEventListener("keydown", (e) => e.key === 'Enter' ? buildUri() : null);
  document.getElementById("nameInput").addEventListener("keydown", (e) => e.key === 'Enter' ? buildUri() : null);
  document.getElementById("titleInput").addEventListener("keydown", (e) => e.key === 'Enter' ? buildUri() : null);
  document.getElementById("buildUriButton").addEventListener("click", buildUri);
  document.getElementById("uriInput").addEventListener("keydown", (e) => e.key === 'Enter' ? checkUri() : null);
  document.getElementById("uriCheckButton").addEventListener("click", (e) => checkUri());
  document.getElementById("resetButton").addEventListener("click", (e) => reset());
  document.getElementById("tableButton").addEventListener("click", (e) => toggleTranscriptionTable());
  tableButton
});
