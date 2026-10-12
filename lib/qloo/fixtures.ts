// ILLUSTRATIVE MOCK FIXTURES — NOT QLOO DATA.
// Hand-written so the app runs with no API key. Entity IDs ("mock-…"), tag IDs ("urn:tag:mock:…"),
// popularity and affinity values are invented. Titles/names are public cultural references only.
// Restaurants/cafés marked "(illustrative)" are fictional. Replace nothing here with real Qloo
// responses: real Qloo data must never be committed to the public repo.

export interface FixtureTag {
  id: string;
  name: string;
  keywords: string[];
}

export interface FixtureEntity {
  id: string;
  name: string;
  type: string; // urn:entity:*
  year?: number;
  dob?: string;
  country?: string; // ISO-2
  city?: string;
  tags: string[]; // tag slugs (resolved to FixtureTag)
  pop: number;
  desc?: string;
}

const t = (slug: string, name: string, keywords: string[] = []): FixtureTag => ({
  id: `urn:tag:mock:${slug}`,
  name,
  keywords: [name.toLowerCase(), slug.replace(/_/g, " "), ...keywords],
});

export const TAGS: FixtureTag[] = [
  t("big_band", "Big Band", ["swing"]),
  t("crooner", "Crooner", ["ballads"]),
  t("rock_and_roll", "Rock and Roll", ["rock n roll", "jive"]),
  t("merseybeat", "Merseybeat", ["beat music"]),
  t("skiffle", "Skiffle"),
  t("sixties_pop", "1960s Pop", ["pop", "sixties"]),
  t("country", "Country", ["country and western"]),
  t("jazz", "Jazz"),
  t("wartime", "Wartime", ["war years", "blitz"]),
  t("scottish_folk", "Scottish Folk", ["ceilidh"]),
  t("musical", "Musical", ["musicals", "show tunes"]),
  t("romance", "Romance"),
  t("comedy", "Comedy", ["sitcom", "funny"]),
  t("war", "War Film"),
  t("western", "Western", ["cowboys"]),
  t("kitchen_sink_drama", "Kitchen-Sink Drama"),
  t("variety", "Variety Show", ["entertainment"]),
  t("soap", "Soap Opera", ["soaps"]),
  t("music_tv", "Music Television", ["pop shows"]),
  t("family", "Family"),
  t("mystery", "Mystery", ["detective", "whodunnit"]),
  t("classic_children", "Children's Classic"),
  t("crime", "Crime Fiction", ["agatha christie"]),
  t("coming_of_age", "Coming of Age"),
  t("fish_and_chips", "Fish and Chips", ["chippy", "fish supper"]),
  t("scouse", "Scouse (stew)", ["lobscouse", "stew"]),
  t("deep_dish_pizza", "Deep-Dish Pizza", ["pizza"]),
  t("diner", "Diner", ["burgers", "milkshake"]),
  t("tearoom", "Tearoom", ["afternoon tea", "tea", "scones"]),
  t("bakery", "Bakery", ["cake", "baking", "shortbread"]),
  t("ice_cream", "Ice Cream", ["ice-cream", "knickerbocker glory"]),
  t("cafe", "Café", ["cafe"]),
  t("music_venue", "Music Venue", ["club", "ballroom"]),
  t("dancing", "Dancing", ["dance", "ballroom dancing", "jive"]),
  t("gardening", "Gardening", ["garden", "allotment"]),
  t("knitting", "Knitting", ["sewing", "crafts"]),
  t("baseball", "Baseball", ["cubs", "white sox"]),
  t("football", "Football", ["soccer", "liverpool fc", "everton"]),
  t("fishing", "Fishing"),
  t("singing", "Singing", ["choir", "sing-along"]),
  t("seaside", "Seaside", ["beach", "coast", "promenade"]),
  t("countryside", "Countryside", ["walking", "hills", "farm"]),
  t("northern_england", "Northern England", ["liverpool", "manchester", "lancashire"]),
  t("scotland", "Scotland", ["scottish", "glasgow"]),
  t("midwest", "American Midwest", ["chicago", "illinois"]),
  t("europe", "European Travel", ["continental"]),
];

export const TAG_BY_SLUG = new Map(TAGS.map((x) => [x.id.replace("urn:tag:mock:", ""), x]));

const A = "urn:entity:artist",
  M = "urn:entity:movie",
  TV = "urn:entity:tv_show",
  B = "urn:entity:book",
  P = "urn:entity:podcast",
  PL = "urn:entity:place",
  D = "urn:entity:destination",
  PE = "urn:entity:person",
  L = "urn:entity:locality";

const e = (
  id: string,
  name: string,
  type: string,
  tags: string[],
  pop: number,
  extra: Partial<FixtureEntity> = {},
): FixtureEntity => ({ id: `mock-${id}`, name, type, tags, pop, ...extra });

export const ENTITIES: FixtureEntity[] = [
  // Artists (year = rough peak year, used only by the mock to look "era-aware")
  e("sinatra", "Frank Sinatra", A, ["crooner", "big_band", "jazz", "singing"], 0.97, { year: 1953, country: "US" }),
  e("elvis", "Elvis Presley", A, ["rock_and_roll", "dancing", "singing"], 0.99, { year: 1956, country: "US" }),
  e("beatles", "The Beatles", A, ["merseybeat", "sixties_pop", "northern_england", "dancing"], 0.99, { year: 1963, country: "GB" }),
  e("cilla", "Cilla Black", A, ["merseybeat", "sixties_pop", "northern_england", "variety"], 0.8, { year: 1964, country: "GB" }),
  e("gerry", "Gerry and the Pacemakers", A, ["merseybeat", "sixties_pop", "northern_england", "football"], 0.7, { year: 1963, country: "GB" }),
  e("dusty", "Dusty Springfield", A, ["sixties_pop", "singing", "romance"], 0.85, { year: 1964, country: "GB" }),
  e("lulu", "Lulu", A, ["sixties_pop", "scotland", "dancing", "variety"], 0.72, { year: 1964, country: "GB" }),
  e("vera", "Vera Lynn", A, ["wartime", "crooner"], 0.78, { year: 1942, country: "GB" }),
  e("natking", "Nat King Cole", A, ["crooner", "jazz", "romance"], 0.9, { year: 1951, country: "US" }),
  e("patsy", "Patsy Cline", A, ["country", "romance"], 0.84, { year: 1961, country: "US" }),
  e("doris", "Doris Day", A, ["crooner", "musical", "romance"], 0.86, { year: 1955, country: "US" }),
  e("donegan", "Lonnie Donegan", A, ["skiffle", "rock_and_roll"], 0.6, { year: 1956, country: "GB" }),
  e("bassey", "Shirley Bassey", A, ["crooner", "variety"], 0.82, { year: 1959, country: "GB" }),
  e("ella", "Ella Fitzgerald", A, ["jazz", "big_band", "singing"], 0.91, { year: 1956, country: "US" }),
  e("andy", "Andy Stewart", A, ["scottish_folk", "scotland", "variety"], 0.45, { year: 1960, country: "GB" }),
  e("deanm", "Dean Martin", A, ["crooner", "comedy"], 0.88, { year: 1955, country: "US" }),

  // Films
  e("brief", "Brief Encounter", M, ["romance", "wartime"], 0.8, { year: 1945, country: "GB" }),
  e("casablanca", "Casablanca", M, ["romance", "wartime"], 0.95, { year: 1942, country: "US" }),
  e("singin", "Singin' in the Rain", M, ["musical", "dancing", "comedy"], 0.93, { year: 1952, country: "US" }),
  e("roman", "Roman Holiday", M, ["romance", "comedy", "europe"], 0.88, { year: 1953, country: "US" }),
  e("som", "The Sound of Music", M, ["musical", "family", "singing"], 0.96, { year: 1965, country: "US" }),
  e("poppins", "Mary Poppins", M, ["musical", "family"], 0.94, { year: 1964, country: "US" }),
  e("hdn", "A Hard Day's Night", M, ["merseybeat", "comedy", "sixties_pop"], 0.82, { year: 1964, country: "GB" }),
  e("carry", "Carry On Nurse", M, ["comedy"], 0.66, { year: 1959, country: "GB" }),
  e("escape", "The Great Escape", M, ["war"], 0.9, { year: 1963, country: "US" }),
  e("rear", "Rear Window", M, ["mystery"], 0.9, { year: 1954, country: "US" }),
  e("whisky", "Whisky Galore!", M, ["comedy", "scotland"], 0.55, { year: 1949, country: "GB" }),
  e("ferry", "Ferry Cross the Mersey", M, ["merseybeat", "northern_england", "sixties_pop"], 0.4, { year: 1965, country: "GB" }),
  e("slih", "Some Like It Hot", M, ["comedy", "jazz"], 0.9, { year: 1959, country: "US" }),
  e("calamity", "Calamity Jane", M, ["musical", "western"], 0.7, { year: 1953, country: "US" }),
  e("saturday", "Saturday Night and Sunday Morning", M, ["kitchen_sink_drama", "northern_england"], 0.5, { year: 1960, country: "GB" }),

  // TV
  e("corrie", "Coronation Street", TV, ["soap", "northern_england"], 0.85, { year: 1960, country: "GB" }),
  e("lucy", "I Love Lucy", TV, ["comedy", "family"], 0.9, { year: 1951, country: "US" }),
  e("sullivan", "The Ed Sullivan Show", TV, ["variety", "rock_and_roll", "music_tv"], 0.8, { year: 1948, country: "US" }),
  e("dixon", "Dixon of Dock Green", TV, ["mystery", "family"], 0.5, { year: 1955, country: "GB" }),
  e("bonanza", "Bonanza", TV, ["western", "family"], 0.78, { year: 1959, country: "US" }),
  e("oppknocks", "Opportunity Knocks", TV, ["variety", "singing"], 0.45, { year: 1956, country: "GB" }),
  e("rsg", "Ready Steady Go!", TV, ["music_tv", "sixties_pop", "dancing"], 0.5, { year: 1963, country: "GB" }),
  e("honeymooners", "The Honeymooners", TV, ["comedy"], 0.7, { year: 1955, country: "US" }),
  e("hancock", "Hancock's Half Hour", TV, ["comedy"], 0.5, { year: 1956, country: "GB" }),
  e("griffith", "The Andy Griffith Show", TV, ["comedy", "family"], 0.8, { year: 1960, country: "US" }),
  e("jukebox", "Juke Box Jury", TV, ["music_tv", "sixties_pop"], 0.4, { year: 1959, country: "GB" }),
  e("whiteheather", "The White Heather Club", TV, ["scottish_folk", "scotland", "dancing"], 0.3, { year: 1958, country: "GB" }),
  e("comedancing", "Come Dancing", TV, ["dancing", "variety"], 0.55, { year: 1950, country: "GB" }),

  // Books
  e("lww", "The Lion, the Witch and the Wardrobe", B, ["classic_children", "family"], 0.95, { year: 1950, country: "GB" }),
  e("mockingbird", "To Kill a Mockingbird", B, ["coming_of_age"], 0.97, { year: 1960, country: "US" }),
  e("catcher", "The Catcher in the Rye", B, ["coming_of_age"], 0.9, { year: 1951, country: "US" }),
  e("paddington450", "4.50 from Paddington", B, ["crime", "mystery"], 0.7, { year: 1957, country: "GB" }),
  e("roomtop", "Room at the Top", B, ["kitchen_sink_drama", "northern_england"], 0.5, { year: 1957, country: "GB" }),
  e("charlotte", "Charlotte's Web", B, ["classic_children", "family"], 0.9, { year: 1952, country: "US" }),
  e("sunset", "Sunset Song", B, ["scotland", "countryside"], 0.5, { year: 1932, country: "GB" }),
  e("cider", "Cider with Rosie", B, ["countryside", "coming_of_age"], 0.6, { year: 1959, country: "GB" }),

  // Podcasts / radio
  e("did", "Desert Island Discs", P, ["singing", "variety", "crooner"], 0.85, { country: "GB" }),
  e("archers", "The Archers", P, ["soap", "countryside"], 0.75, { country: "GB" }),
  e("otr", "Old-Time Radio Hour (illustrative)", P, ["mystery", "comedy", "variety"], 0.5, { country: "US" }),
  e("standards", "Songbook Standards (illustrative)", P, ["crooner", "big_band", "jazz"], 0.45, { country: "US" }),
  e("gardenhour", "Gardeners' Question Time", P, ["gardening", "countryside"], 0.6, { country: "GB" }),

  // Places — fictional venues marked (illustrative), plus a few public landmarks
  e("liv-chippy", "Example Chippy (illustrative)", PL, ["fish_and_chips", "seaside"], 0.6, { city: "Liverpool", country: "GB" }),
  e("liv-scouse", "Example Scouse Café (illustrative)", PL, ["scouse", "cafe"], 0.5, { city: "Liverpool", country: "GB" }),
  e("liv-cavern", "The Cavern Club", PL, ["merseybeat", "music_venue", "dancing"], 0.9, { city: "Liverpool", country: "GB" }),
  e("chi-pizza", "Example Deep-Dish Pizzeria (illustrative)", PL, ["deep_dish_pizza"], 0.7, { city: "Chicago", country: "US" }),
  e("chi-diner", "Example Diner (illustrative)", PL, ["diner", "ice_cream"], 0.6, { city: "Chicago", country: "US" }),
  e("chi-wrigley", "Wrigley Field", PL, ["baseball"], 0.95, { city: "Chicago", country: "US" }),
  e("gla-tearoom", "Example Tearoom (illustrative)", PL, ["tearoom", "bakery"], 0.6, { city: "Glasgow", country: "GB" }),
  e("gla-barrowland", "Barrowland Ballroom", PL, ["dancing", "music_venue"], 0.8, { city: "Glasgow", country: "GB" }),
  e("gla-chippy", "Example Glasgow Chippy (illustrative)", PL, ["fish_and_chips"], 0.5, { city: "Glasgow", country: "GB" }),
  e("any-icecream", "Example Seaside Ice-Cream Parlour (illustrative)", PL, ["ice_cream", "seaside"], 0.4, {}),
  e("any-tearoom", "Example Station Tearoom (illustrative)", PL, ["tearoom", "bakery"], 0.4, {}),

  // Destinations
  e("blackpool", "Blackpool", D, ["seaside", "dancing", "northern_england"], 0.8, { country: "GB" }),
  e("iom", "Isle of Man", D, ["seaside", "countryside"], 0.6, { country: "GB" }),
  e("llandudno", "Llandudno", D, ["seaside", "countryside"], 0.55, { country: "GB" }),
  e("lakes", "Lake District", D, ["countryside", "gardening"], 0.85, { country: "GB" }),
  e("niagara", "Niagara Falls", D, ["countryside"], 0.9, { country: "US" }),
  e("dells", "Wisconsin Dells", D, ["midwest", "countryside", "fishing"], 0.5, { country: "US" }),
  e("atlantic", "Atlantic City", D, ["seaside", "variety"], 0.7, { country: "US" }),
  e("largs", "Largs", D, ["seaside", "scotland", "ice_cream"], 0.4, { country: "GB" }),
  e("arran", "Isle of Arran", D, ["scotland", "countryside"], 0.5, { country: "GB" }),
  e("rome", "Rome", D, ["europe", "romance"], 0.95, { country: "IT" }),
  e("paris", "Paris", D, ["europe", "romance"], 0.97, { country: "FR" }),

  // People (performers) — used for the date-of-birth era cross-check
  e("pe-sinatra", "Frank Sinatra", PE, ["crooner"], 0.97, { dob: "1915-12-12" }),
  e("pe-elvis", "Elvis Presley", PE, ["rock_and_roll"], 0.99, { dob: "1935-01-08" }),
  e("pe-cilla", "Cilla Black", PE, ["merseybeat", "variety"], 0.8, { dob: "1943-05-27" }),
  e("pe-lennon", "John Lennon", PE, ["merseybeat"], 0.98, { dob: "1940-10-09" }),
  e("pe-dusty", "Dusty Springfield", PE, ["sixties_pop"], 0.85, { dob: "1939-04-16" }),
  e("pe-lulu", "Lulu", PE, ["sixties_pop", "scotland"], 0.72, { dob: "1948-11-03" }),
  e("pe-vera", "Vera Lynn", PE, ["wartime"], 0.78, { dob: "1917-03-20" }),
  e("pe-natking", "Nat King Cole", PE, ["crooner"], 0.9, { dob: "1919-03-17" }),
  e("pe-patsy", "Patsy Cline", PE, ["country"], 0.84, { dob: "1932-09-08" }),
  e("pe-doris", "Doris Day", PE, ["crooner", "musical"], 0.86, { dob: "1922-04-03" }),
  e("pe-donegan", "Lonnie Donegan", PE, ["skiffle"], 0.6, { dob: "1931-04-29" }),
  e("pe-bassey", "Shirley Bassey", PE, ["crooner"], 0.82, { dob: "1937-01-08" }),
  e("pe-ella", "Ella Fitzgerald", PE, ["jazz"], 0.91, { dob: "1917-04-25" }),
  e("pe-deanm", "Dean Martin", PE, ["crooner"], 0.88, { dob: "1917-06-07" }),
  e("pe-andy", "Andy Stewart", PE, ["scottish_folk"], 0.45, { dob: "1933-12-30" }),
  e("pe-gerry", "Gerry Marsden", PE, ["merseybeat"], 0.6, { dob: "1942-09-24" }),
  e("pe-audrey", "Audrey Hepburn", PE, ["romance"], 0.95, { dob: "1929-05-04" }),
  e("pe-julie", "Julie Andrews", PE, ["musical"], 0.93, { dob: "1935-10-01" }),
  e("pe-lucille", "Lucille Ball", PE, ["comedy"], 0.9, { dob: "1911-08-06" }),

  // Localities (search-only type) — hometown signal
  e("loc-liverpool", "Liverpool", L, ["northern_england", "merseybeat", "seaside", "football"], 0.9, { country: "GB" }),
  e("loc-chicago", "Chicago", L, ["midwest", "jazz", "baseball", "deep_dish_pizza"], 0.95, { country: "US" }),
  e("loc-glasgow", "Glasgow", L, ["scotland", "dancing"], 0.85, { country: "GB" }),
];
