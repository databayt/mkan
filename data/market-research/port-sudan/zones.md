# Comprehensive Port Sudan Rental Zones & Supply Density Analysis

> Canonical report on Port Sudan's geographic rental structure across all **45 recognized zones**.
> Generated **2026-08-14** from multi-layer spatial research (OSM, Google Business, Classifieds, Municipal Records).
> Machine-readable datasets: [`zones.json`](./zones.json) · [`zone-density.json`](./zone-density.json) · Methodology: [`zone-methodology.md`](./zone-methodology.md)

---

## 1. Geographic & Administrative Sectors

Port Sudan's urban structure is organized across five distinct operational and administrative sectors:
1. **Central Locality (`central` — وحدة بورتسودان وسط)**: Downtown, historic Greek & merchant quarters, stadium district.
2. **South Locality & Deims (`south` — وحدة بورتسودان جنوب)**: Historic southern deims, Airport District, commercial markets.
3. **East Locality / Eastern Shore (`east` — وحدة بورتسودان شرق / البر الشرقي)**: Waterfront corniche, passenger port, fish market, coastal deims.
4. **North & NW Expansion (`north_expansion` — المربعات والمخططات الحديثة)**: Salalab squares, Hadal apartment strip, planned urban sprawl.
5. **Northern Coastal Tourism (`coastal_tourism` — المحور السياحي الساحلي)**: Arous diving villages and Red Sea resort camps (~45 km north).

---

## 2. Zone Supply Density & Acquisition Priority Master Table

| Rank | Zone (Arabic / English) | Sector | Type | Discovered Leads | Core Apts | Live Mkan | Phone Ready | Supply Status | Demand Status | Priority Score | Tier |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :---: | :--- |
| 1 | **حي دقنة** (Digna District) | `east` | `landmark_based` | **11** | 1 | **8** | 7 | `HIGH_SUPPLY` | `INSUFFICIENT_DATA` | **72** | **CRITICAL_IMMEDIATE** |
| 2 | **الملاحة** (Al Malaha) | `south` | `commonly_used` | **4** | 0 | **0** | 3 | `MODERATE_SUPPLY` | `INSUFFICIENT_DATA` | **36** | **MEDIUM_EXPANSION** |
| 3 | **وسط المدينة** (City Centre) | `central` | `official` | **4** | 2 | **0** | 2 | `MODERATE_SUPPLY` | `INSUFFICIENT_DATA` | **28** | **MEDIUM_EXPANSION** |
| 4 | **الأسكلة** (Al-Askala) | `east` | `commonly_used` | **2** | 2 | **0** | 1 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **24** | **MEDIUM_EXPANSION** |
| 5 | **ترانزيت** (Transit District) | `south` | `commonly_used` | **1** | 1 | **0** | 1 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **12** | **MONITOR_OPPORTUNITY** |
| 6 | **حي المطار** (Airport District) | `south` | `commonly_used` | **2** | 0 | **1** | 1 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **11** | **MONITOR_OPPORTUNITY** |
| 7 | **دبايوا** (Dabaiwa) | `central` | `commonly_used` | **0** | 0 | **7** | 0 | `HIGH_SUPPLY` | `INSUFFICIENT_DATA` | **10** | **MONITOR_OPPORTUNITY** |
| 8 | **غير محدد / عام** (Unassigned / Generic) | `uncertain` | `uncertain` | **10** | 4 | **6** | 2 | `HIGH_SUPPLY` | `INSUFFICIENT_DATA` | **10** | **MONITOR_OPPORTUNITY** |
| 9 | **ديم المدينة** (Deim Al-Madina) | `central` | `commonly_used` | **1** | 0 | **0** | 1 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **9** | **LOW_PRIORITY** |
| 10 | **حي الشاطئ** (Al-Shati / Beach District) | `south` | `commonly_used` | **1** | 0 | **0** | 1 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **9** | **LOW_PRIORITY** |
| 11 | **هدل** (Hadal) | `north_expansion` | `commonly_used` | **1** | 1 | **1** | 0 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **9** | **LOW_PRIORITY** |
| 12 | **السوق الشعبي** (Popular Market) | `central` | `landmark_based` | **1** | 1 | **0** | 0 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **7** | **LOW_PRIORITY** |
| 13 | **حي طراب حدال** (Hayy Tarab Hadal) | `north_expansion` | `commonly_used` | **1** | 1 | **0** | 0 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **7** | **LOW_PRIORITY** |
| 14 | **منطقة الكيلو** (Al-Kaylo) | `south` | `landmark_based` | **3** | 0 | **0** | 0 | `MODERATE_SUPPLY` | `INSUFFICIENT_DATA` | **4** | **LOW_PRIORITY** |
| 15 | **عروس** (Arous) | `coastal_tourism` | `commonly_used` | **0** | 0 | **2** | 0 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **4** | **LOW_PRIORITY** |
| 16 | **ديم سواكن** (Deim Sawakin) | `south` | `commonly_used` | **0** | 0 | **1** | 0 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **2** | **LOW_PRIORITY** |
| 17 | **كوريا** (Kurya) | `south` | `commonly_used` | **0** | 0 | **1** | 0 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **2** | **LOW_PRIORITY** |
| 18 | **الميرغنية** (Al-Mirghaniya) | `south` | `commonly_used` | **0** | 0 | **1** | 0 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **2** | **LOW_PRIORITY** |
| 19 | **حي الهدى** (Al-Huda) | `north_expansion` | `commonly_used` | **0** | 0 | **1** | 0 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **2** | **LOW_PRIORITY** |
| 20 | **ديم عرب** (Deim Arab) | `central` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 21 | **حي الأغاريق** (Greek Quarter) | `central` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 22 | **حي العظمة** (Hayy Al-Azama) | `central` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 23 | **حي الجامعة** (University District) | `central` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 24 | **حي التقدم** (Al-Taqaddum) | `central` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 25 | **ديم سجن** (Deim Sijn) | `central` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 26 | **السكة حديد** (Railway District) | `central` | `landmark_based` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 27 | **ديم جابر** (Deim Jaber) | `south` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 28 | **ديم موسى** (Deim Musa) | `south` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 29 | **دار النعيم** (Dar Al-Naeem) | `south` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 30 | **دار السلام** (Dar Al-Salam) | `south` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 31 | **الرياض** (Al-Riyadh) | `south` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 32 | **فلب** (Philip) | `south` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 33 | **الصداقة** (Al-Sadaqa) | `south` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 34 | **سوق ليبيا** (Libya Market) | `south` | `landmark_based` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 35 | **ديم النور** (Deim Al-Noor) | `east` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 36 | **سلبونا** (Salbona) | `east` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 37 | **أبو حشيش** (Abu Hashish) | `east` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 38 | **القادسية** (Al-Qadisiya) | `east` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 39 | **حي الثورة** (Al-Thawra / Al-Thawrat) | `east` | `commonly_used` | **1** | 0 | **0** | 0 | `EMERGING_SUPPLY` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 40 | **ديم التيجاني** (Deim Al-Tijani) | `east` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 41 | **محطة المدينة** (Town Station) | `east` | `landmark_based` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 42 | **فلمنغو** (Flamingo) | `east` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 43 | **سلالاب** (Salalab) | `north_expansion` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 44 | **أم القرى** (Umm Al-Qura) | `north_expansion` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |
| 45 | **مدينة البشير السكنية** (Bashir Residential City) | `north_expansion` | `commonly_used` | **0** | 0 | **0** | 0 | `LOW_SUPPLY_UNEXPLORED` | `INSUFFICIENT_DATA` | **0** | **LOW_PRIORITY** |

---

## 3. Detailed Zone Directory Profiles

### 1. حي دقنة (Digna District) — `digna`

- **Sector**: `east` | **Type**: `landmark_based` | **Confidence**: `high`
- **Aliases**: `دقنة`, `Daqna`, `Degna`, `منطقة الميناء والكورنيش`, `كورنيش دقنة`, `شارع الاذاعة والتلفزيون`
- **Coordinates**: `19.6089, 37.2213` (Radius: 0.9 km)
- **Description**: Prime seafront and port corridor along the corniche. Encompasses Prince Osman Digna Passenger Port, Osman Digna Hospital, and premier waterfront hotel operations (Coral, Bohein, Basiri Plaza).
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **11** (25.6% of city total)
  - Core Furnished / Hotel Apartments: **1**
  - Hotels: **10** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **8** (27.6% of city portfolio)
  - Phone-Reachable Leads: **7**
  - Priority Score: **72/100** (`CRITICAL_IMMEDIATE`)

**Discovered Leads in this Zone:**

- **مجمع الربوة السياحي** (`hotel`) — Phone: `+249 10 069 2656` ⭐ 4.2 (12 reviews)
- **Basiri Plaza Hotel** (`hotel`) — Phone: `+249 91 213 3278` ⭐ 3.5 (22 reviews)
- **Bohein Hotel** (`hotel`) — Phone: `+249 92 283 5200` ⭐ 2.3 (7 reviews)
- **Coral Port Sudan** (`hotel`) — Phone: `+249 311 83 9800, +249 18 377 4100` ⭐ 3.1 (23 reviews)
- **Palace Palace Hotel** (`hotel`) — Phone: `+249 91 233 4201` ⭐ 3.5 (11 reviews)
- **Marina Hotel Port Sudan** (`hotel`) — Phone: `+249 91 232 3232` ⭐ 2.5 (2 reviews)
- **فندق سبا** (`hotel`) — Phone: `+249 91 285 1977` ⭐ 1 (1 reviews)
- **Baasher Palace Hotel** (`hotel`) — Phone: `*No public phone*` 
- **مارينا للشقق الفندقية** (`hotel_apartment`) — Phone: `*No public phone*` 
- **Marhaba Hotel** (`hotel`) — Phone: `*No public phone*` 
- **Nour al-Yemen** (`hotel`) — Phone: `*No public phone*` 

### 2. الملاحة (Al Malaha) — `malaha`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `Al Malaga`, `Al Malaja`, `الملجة`, `سوق الملاحة`
- **Coordinates**: `19.6101861, 37.2150728` (Radius: 0.8 km)
- **Description**: High-density commercial marketplace quarter and residential district bridging downtown and the southern deims.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **4** (9.3% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **4** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **3**
  - Priority Score: **36/100** (`MEDIUM_EXPANSION`)

**Discovered Leads in this Zone:**

- **Okere Hotel** (`hotel`) — Phone: `+249 91 229 3026` ⭐ 3.3 (4 reviews)
- **Dongla Hotel** (`hotel`) — Phone: `+249 91 386 1868` ⭐ 1.7 (3 reviews)
- **فندق التعاون** (`hotel`) — Phone: `+249 90 126 2003` ⭐ 2 (1 reviews)
- **فندق علا** (`hotel`) — Phone: `*No public phone*` ⭐ 5 (2 reviews)

### 3. وسط المدينة (City Centre) — `city-centre`

- **Sector**: `central` | **Type**: `official` | **Confidence**: `high`
- **Aliases**: `Town Centre`, `Downtown`, `وسط بورتسودان`, `Central Port Sudan`, `السوق الكبير`, `وسط السوق`
- **Coordinates**: `19.6213889, 37.2102778` (Radius: 1.2 km)
- **Description**: The primary administrative, commercial, and banking core of Port Sudan. Features major bank headquarters, government ministries, corporate offices, and central hotels.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **4** (9.3% of city total)
  - Core Furnished / Hotel Apartments: **2**
  - Hotels: **1** | Resorts: **0** | Real Estate Agencies: **1**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **2**
  - Priority Score: **28/100** (`MEDIUM_EXPANSION`)

**Discovered Leads in this Zone:**

- **السواحلي للشقق الفندقية** (`hotel_apartment`) — Phone: `+249 90 448 5000` ⭐ 4.5 (2 reviews)
- **Al Taher Mohamed Saleh Hotel Apartments** (`hotel_apartment`) — Phone: `+249 91 304 5131` ⭐ 5 (1 reviews)
- **Ranya Hotel** (`hotel`) — Phone: `*No public phone*` 
- **هناء الكاشف — Global Real Estate Marketer** (`real_estate_office`) — Phone: `*No public phone*` 

### 4. الأسكلة (Al-Askala) — `al-askala`

- **Sector**: `east` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `الاسكلة`, `Askala Harbour`
- **Coordinates**: `19.623, 37.225` (Radius: 0.6 km)
- **Description**: Historic maritime quarter overlooking the inner harbour and shipping docks.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **2** (4.7% of city total)
  - Core Furnished / Hotel Apartments: **2**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **1**
  - Priority Score: **24/100** (`MEDIUM_EXPANSION`)

**Discovered Leads in this Zone:**

- **Mirak Furnished Suites** (`furnished_apartment`) — Phone: `+249 90 113 2695` ⭐ 4.9 (8 reviews)
- **Alkapatin** (`furnished_apartment`) — Phone: `*No public phone*` 

### 5. ترانزيت (Transit District) — `transit`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `حي ترانزيت`, `منطقة الترانزيت`, `Transit Quarter`
- **Coordinates**: `19.598, 37.214` (Radius: 0.8 km)
- **Description**: Southern district near the port access roads; highly prominent in real estate classifieds for international NGO staff and furnished rentals.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **1** (2.3% of city total)
  - Core Furnished / Hotel Apartments: **1**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **1**
  - Priority Score: **12/100** (`MONITOR_OPPORTUNITY`)

**Discovered Leads in this Zone:**

- **باير للشقق الفندقيه** (`hotel_apartment`) — Phone: `+249 91 780 1350` ⭐ 5 (1 reviews)

### 6. حي المطار (Airport District) — `airport-district`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `حىى المطار`, `Airport district`, `حي المطار القديم`, `حي المطار مربع 1`, `حي المطار مربع 4`, `شارع القنصلية المصرية`, `مدخل المدينة`
- **Coordinates**: `19.5750337, 37.2082191` (Radius: 1.5 km)
- **Description**: Premier southern residential and commercial district beside the historic regional air base. Highly favored by real estate agencies and brokers for upscale furnished apartment blocks and diplomatic residences.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **2** (4.7% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **1** | Resorts: **0** | Real Estate Agencies: **1**
  - Live Mkan Listings: **1** (3.4% of city portfolio)
  - Phone-Reachable Leads: **1**
  - Priority Score: **11/100** (`MONITOR_OPPORTUNITY`)

**Discovered Leads in this Zone:**

- **أملاك العقارية** (`real_estate_office`) — Phone: `0123450028, 0912341087, 0912348586` 
- **فندق حي المطار** (`hotel`) — Phone: `*No public phone*` 

### 7. دبايوا (Dabaiwa) — `dabaiwa`

- **Sector**: `central` | **Type**: `commonly_used` | **Confidence**: `medium`
- **Aliases**: `حي دبايوا`, `Dabaywa`, `نادي دبايوا`
- **Coordinates**: `19.624, 37.202` (Radius: 0.7 km)
- **Description**: Active central quarter celebrated for its sporting club and lively commerce; frequently cited in local rental advertisements.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **7** (24.1% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **10/100** (`MONITOR_OPPORTUNITY`)

### 8. غير محدد / عام (Unassigned / Generic) — `unknown`

- **Sector**: `uncertain` | **Type**: `uncertain` | **Confidence**: `unknown`
- **Aliases**: `unknown`, `other`, `unassigned`
- **Coordinates**: *Unresolved coordinates*
- **Description**: Catch-all bucket for city-wide leads or listings with missing or placeholder coordinates.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **10** (23.3% of city total)
  - Core Furnished / Hotel Apartments: **4**
  - Hotels: **3** | Resorts: **2** | Real Estate Agencies: **0**
  - Live Mkan Listings: **6** (20.7% of city portfolio)
  - Phone-Reachable Leads: **2**
  - Priority Score: **10/100** (`MONITOR_OPPORTUNITY`)

**Discovered Leads in this Zone:**

- **Sudan Red Sea Resort** (`resort`) — Phone: `+249 91 246 5650` ⭐ 4.4 (12 reviews)
- **منتجع جبل الست / Jebel Al-Sit resort** (`resort`) — Phone: `+249 12 337 3737` ⭐ 3.3 (4 reviews)
- **Hala's House in Port-Sudan** (`furnished_apartment`) — Phone: `*No public phone*` 
- **Prestige hotel apartments** (`furnished_apartment`) — Phone: `*No public phone*` 
- **سيف للشقق المفروشة** (`furnished_apartment`) — Phone: `*No public phone*` 
- **شقق النرجس الفندقية** (`hotel_apartment`) — Phone: `*No public phone*` 
- **Flora Hotel** (`hotel`) — Phone: `*No public phone*` 
- **Samarmaz Hotel** (`hotel`) — Phone: `*No public phone*` 
- **Mercure Port Sudan** (`hotel`) — Phone: `*No public phone*` 
- **Stylish Port Sudan** (`unknown`) — Phone: `*No public phone*` 

### 9. ديم المدينة (Deim Al-Madina) — `deim-madina`

- **Sector**: `central` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `ديم مدينة`, `Deim Madina`, `ديم مدينه غرب`, `Deim West`, `منطقة الاستاد`
- **Coordinates**: `19.6166255, 37.2066764` (Radius: 0.8 km)
- **Description**: Prominent central residential and civic quarter housing Port Sudan Stadium (استاد بورتسودان), the Popular Square (الساحة الشعبية), and its own bustling local market.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **1** (2.3% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **1** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **1**
  - Priority Score: **9/100** (`LOW_PRIORITY`)

**Discovered Leads in this Zone:**

- **فندق منة** (`hotel`) — Phone: `+249 91 235 5523` ⭐ 2.7 (3 reviews)

### 10. حي الشاطئ (Al-Shati / Beach District) — `hayy-al-shati`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `الشاطئ`, `Beach Quarter`, `كورنيش الشاطئ`
- **Coordinates**: `19.588, 37.218` (Radius: 0.8 km)
- **Description**: Southern coastal quarter enjoying beachfront access, sea views, and residential villas.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **1** (2.3% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **1** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **1**
  - Priority Score: **9/100** (`LOW_PRIORITY`)

**Discovered Leads in this Zone:**

- **Grand Hotel Elsahil** (`hotel`) — Phone: `+249 12 365 3100` ⭐ 5 (2 reviews)

### 11. هدل (Hadal) — `hadal`

- **Sector**: `north_expansion` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `سوق هدل`, `Hadal`, `حي الخليج`, `شقق الخليج`
- **Coordinates**: `19.6437057, 37.2182555` (Radius: 1 km)
- **Description**: North-eastern corridor on the coastal highway approach; features modern residential buildings and furnished apartment blocks (e.g. Stylish Staycation Spot, Gulf Apartments).
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **1** (2.3% of city total)
  - Core Furnished / Hotel Apartments: **1**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **1** (3.4% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **9/100** (`LOW_PRIORITY`)

**Discovered Leads in this Zone:**

- **شقق الخليج المفروشة** (`furnished_apartment`) — Phone: `*No public phone*` 

### 12. السوق الشعبي (Popular Market) — `popular-market`

- **Sector**: `central` | **Type**: `landmark_based` | **Confidence**: `high`
- **Aliases**: `Souq Al Shaabi`, `السوق الشعبي بورتسودان`, `الموقف العام`
- **Coordinates**: `19.6270857, 37.1995833` (Radius: 0.6 km)
- **Description**: High-traffic commercial, wholesale, and intercity bus transport nexus in western Port Sudan.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **1** (2.3% of city total)
  - Core Furnished / Hotel Apartments: **1**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **7/100** (`LOW_PRIORITY`)

**Discovered Leads in this Zone:**

- **السلطان للشقق الفندقية** (`furnished_apartment`) — Phone: `*No public phone*` 

### 13. حي طراب حدال (Hayy Tarab Hadal) — `tarab-hadal`

- **Sector**: `north_expansion` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `طراب حدال`, `Tarab Hadal`, `ترب هول`
- **Coordinates**: `19.6583333, 37.2072222` (Radius: 1.1 km)
- **Description**: Northern residential quarter situated north of Salalab and west of Hadal.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **1** (2.3% of city total)
  - Core Furnished / Hotel Apartments: **1**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **7/100** (`LOW_PRIORITY`)

**Discovered Leads in this Zone:**

- **الاسد** (`furnished_apartment`) — Phone: `*No public phone*` 

### 14. منطقة الكيلو (Al-Kaylo) — `al-kaylo`

- **Sector**: `south` | **Type**: `landmark_based` | **Confidence**: `medium`
- **Aliases**: `الكيلو`, `شاليه الكيلو`, `منتجع الكيلو`, `الكيلو بورتسودان`
- **Coordinates**: `19.557, 37.208` (Radius: 1.2 km)
- **Description**: Southern highway gateway area known for recreational chalets, wedding event halls, and holiday rest-houses.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **3** (7.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **1** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **4/100** (`LOW_PRIORITY`)

**Discovered Leads in this Zone:**

- **الكيلو منتجع سياحي** (`resort`) — Phone: `*No public phone*` 
- **شاليه الكيلو بورتسودان** (`chalet`) — Phone: `*No public phone*` 
- **منزل حميدة عبد الرحمن ود الغرب** (`guest_house`) — Phone: `*No public phone*` 

### 15. عروس (Arous) — `arous`

- **Sector**: `coastal_tourism` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `Arous`, `Arous Camp`, `Arous Red Sea Diving Resort`, `مخيم عروس`, `قرية إيمان`, `Iman Village`, `منتجع عروس`
- **Coordinates**: `20.0067461, 37.1898407` (Radius: 8 km)
- **Description**: Prestigious Red Sea coastal resort corridor located ~45 km north of Port Sudan, famous worldwide for diving villages, coral reef diving, eco-resorts, and vacation camps.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **2** (6.9% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **4/100** (`LOW_PRIORITY`)

### 16. ديم سواكن (Deim Sawakin) — `deim-sawakin`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `Deim Suakin`, `ديم سواكن جنوب`
- **Coordinates**: `19.601, 37.212` (Radius: 0.8 km)
- **Description**: One of Port Sudan’s oldest southern quarters, historically anchoring the transit corridor toward the ancient port of Suakin.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **1** (3.4% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **2/100** (`LOW_PRIORITY`)

### 17. كوريا (Kurya) — `kurya`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `ديم كوريا`, `Deim Kurya`
- **Coordinates**: `19.5958333, 37.1991667` (Radius: 0.9 km)
- **Description**: Southern residential quarter with detached family homes, private compounds, and expanding rental apartments.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **1** (3.4% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **2/100** (`LOW_PRIORITY`)

### 18. الميرغنية (Al-Mirghaniya) — `al-mirghaniya`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `حي الميرغنية`, `Mirghaniya`
- **Coordinates**: `19.592, 37.205` (Radius: 0.7 km)
- **Description**: Established southern residential neighborhood with active community markets.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **1** (3.4% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **2/100** (`LOW_PRIORITY`)

### 19. حي الهدى (Al-Huda) — `al-huda`

- **Sector**: `north_expansion` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `الهدى`, `حي الهدى مربع 10`
- **Coordinates**: `19.655, 37.198` (Radius: 0.9 km)
- **Description**: Modern planned residential expansion quarter located in the north-western sector.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **1** (3.4% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **2/100** (`LOW_PRIORITY`)

### 20. ديم عرب (Deim Arab) — `deim-arab`

- **Sector**: `central` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `Deim Arab`, `Soog Deim Arab`, `سوق ديم عرب`, `أم درمان البجا`
- **Coordinates**: `19.6141667, 37.2005556` (Radius: 0.8 km)
- **Description**: Historic cultural and residential quarter known historically as "Omdurman of the Beja", vibrant with heritage markets and traditional community life.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 21. حي الأغاريق (Greek Quarter) — `hayy-al-aghareeq`

- **Sector**: `central` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `الأغاريق`, `Greek District`, `حي اليونانيين`
- **Coordinates**: `19.6185, 37.212` (Radius: 0.6 km)
- **Description**: Historic central upscale quarter originally settled by the Greek and Mediterranean expatriate trading communities; features colonial-era architectural villas and commercial offices.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 22. حي العظمة (Hayy Al-Azama) — `hayy-al-azama`

- **Sector**: `central` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `العظمة`, `Al-Azama District`
- **Coordinates**: `19.62, 37.2085` (Radius: 0.6 km)
- **Description**: Prestigious residential quarter directly adjacent to Port Sudan Stadium and the town center, traditionally home to senior civil servants and prominent merchant families.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 23. حي الجامعة (University District) — `hayy-al-jamia`

- **Sector**: `central` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `خور كلاب`, `Khor Kilab`, `حي جامعة البحر الأحمر`
- **Coordinates**: `19.626, 37.2115` (Radius: 0.7 km)
- **Description**: Upscale residential neighborhood surrounding Red Sea University faculties; formerly known as Khor Kilab before being formally renamed.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 24. حي التقدم (Al-Taqaddum) — `taqaddum`

- **Sector**: `central` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `التقدم`, `Hayy Al Taqaddum`
- **Coordinates**: `19.618, 37.205` (Radius: 0.6 km)
- **Description**: Dense residential neighborhood located in the central core between Deim Al-Madina and the main market.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 25. ديم سجن (Deim Sijn) — `deim-sijn`

- **Sector**: `central` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `ديم السجن`, `Deim Prison`
- **Coordinates**: `19.6175, 37.209` (Radius: 0.5 km)
- **Description**: Central quarter housing government administrative facilities and mixed-use commercial properties.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 26. السكة حديد (Railway District) — `railway-district`

- **Sector**: `central` | **Type**: `landmark_based` | **Confidence**: `high`
- **Aliases**: `حي السكة حديد`, `محطة السكة حديد`, `ورش السكة حديد`
- **Coordinates**: `19.6210458, 37.2069813` (Radius: 0.6 km)
- **Description**: Historical quarter centered on the Sudan Railways terminal, locomotive workshops, and administrative offices.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 27. ديم جابر (Deim Jaber) — `deim-jaber`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `Deim Gaber`
- **Coordinates**: `19.608, 37.204` (Radius: 0.7 km)
- **Description**: Established residential quarter in the south-western residential quadrant.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 28. ديم موسى (Deim Musa) — `deim-musa`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `Deim Musa`, `الديوم الجنوبية`
- **Coordinates**: `19.605, 37.2113889` (Radius: 0.8 km)
- **Description**: Southern residential quarter situated between Al Malaha and Kurya.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 29. دار النعيم (Dar Al-Naeem) — `dar-al-naeem`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `حي دار النعيم`
- **Coordinates**: `19.585, 37.202` (Radius: 0.7 km)
- **Description**: Southern residential quarter with growing local rental housing supply.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 30. دار السلام (Dar Al-Salam) — `dar-al-salam`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `حي دار السلام جنوب`
- **Coordinates**: `19.582, 37.198` (Radius: 0.7 km)
- **Description**: Southern residential district characterized by family residences and local markets.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 31. الرياض (Al-Riyadh) — `al-riyadh`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `حي الرياض بورتسودان`, `Riyadh`
- **Coordinates**: `19.579, 37.204` (Radius: 0.7 km)
- **Description**: Southern residential quarter situated close to the Airport District and highway exits.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 32. فلب (Philip) — `philip`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `حي فيليب`, `حي فلب`
- **Coordinates**: `19.573, 37.2` (Radius: 0.7 km)
- **Description**: Southern residential quarter featuring villa developments and residential compounds.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 33. الصداقة (Al-Sadaqa) — `al-sadaqa`

- **Sector**: `south` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `حي الصداقة`, `الصداقة مربع 9`
- **Coordinates**: `19.568, 37.195` (Radius: 0.9 km)
- **Description**: Modern planned residential quarter organized in numbered grid squares (مربعات).
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 34. سوق ليبيا (Libya Market) — `souq-libya`

- **Sector**: `south` | **Type**: `landmark_based` | **Confidence**: `high`
- **Aliases**: `Souq Libya`, `سوق ليبيا جنوب`
- **Coordinates**: `19.5789292, 37.1934267` (Radius: 0.8 km)
- **Description**: Southern commercial marketplace near the highway access route connecting toward Suakin and national transit.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 35. ديم النور (Deim Al-Noor) — `deim-al-noor`

- **Sector**: `east` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `Deim El Noor`, `ديم النور شرق`
- **Coordinates**: `19.628, 37.226` (Radius: 0.8 km)
- **Description**: Dynamic and centrally situated eastern quarter renowned for its proximity to tourist amenities, markets, and municipal services.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 36. سلبونا (Salbona) — `salbona`

- **Sector**: `east` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `السقالة`, `سوق السمك السقالة`, `Salbona Port`
- **Coordinates**: `19.636, 37.23` (Radius: 0.8 km)
- **Description**: Iconic eastern coastal quarter hosting Port Sudan’s celebrated fish market (سوق السمك / السقالة) and coastal maritime dining.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 37. أبو حشيش (Abu Hashish) — `abu-hashish`

- **Sector**: `east` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `أبوحشيش`, `Abu Hashish District`
- **Coordinates**: `19.642, 37.228` (Radius: 0.8 km)
- **Description**: Traditional eastern coastal residential quarter bordering Salbona.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 38. القادسية (Al-Qadisiya) — `al-qadisiya`

- **Sector**: `east` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `حي القادسية`, `Qadisiya`
- **Coordinates**: `19.648, 37.225` (Radius: 0.8 km)
- **Description**: Established eastern residential quarter north of Abu Hashish.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 39. حي الثورة (Al-Thawra / Al-Thawrat) — `al-thawra`

- **Sector**: `east` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `الثورات`, `الثورة شرق`, `حي الثورة بورتسودان`
- **Coordinates**: `19.652, 37.22` (Radius: 0.9 km)
- **Description**: Major eastern residential district with extensive residential plots and community schools.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **1** (2.3% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

**Discovered Leads in this Zone:**

- **منزل ابوقرون** (`guest_house`) — Phone: `*No public phone*` 

### 40. ديم التيجاني (Deim Al-Tijani) — `deim-al-tijani`

- **Sector**: `east` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `ديم تيجاني`, `Deim Tijani`
- **Coordinates**: `19.631, 37.228` (Radius: 0.6 km)
- **Description**: Eastern residential quarter located near Deim Al-Noor.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 41. محطة المدينة (Town Station) — `town-station`

- **Sector**: `east` | **Type**: `landmark_based` | **Confidence**: `high`
- **Aliases**: `Town Station`, `Mahattat Al-Madina`
- **Coordinates**: `19.6333333, 37.2333333` (Radius: 0.9 km)
- **Description**: North-eastern maritime transit and passenger station quarter beside the harbour approaches.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 42. فلمنغو (Flamingo) — `flamingo`

- **Sector**: `east` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `Falamingu`, `Flamingo Bay`, `ميناء فلمنغو`, `خور فلمنغو`
- **Coordinates**: `19.6876, 37.2401` (Radius: 1.6 km)
- **Description**: Far-northern coastal locality and sheltered marine inlet hosting specialized naval, commercial, and maritime docking facilities.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 43. سلالاب (Salalab) — `salalab`

- **Sector**: `north_expansion` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `ديم سلاب`, `Deim Salalab`, `سلالاب شرق`, `سلالاب غرب`, `سلالاب مربع 1`, `سلالاب مربع 3`, `الواحة`
- **Coordinates**: `19.6350442, 37.1900278` (Radius: 1.4 km)
- **Description**: Expansive north-western residential quarter with active multi-story construction, family residences, and mid-term furnished flats.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 44. أم القرى (Umm Al-Qura) — `umm-al-qura`

- **Sector**: `north_expansion` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `Umm Al Qura`, `أم القرى شمال`
- **Coordinates**: `19.6693681, 37.1892649` (Radius: 1.3 km)
- **Description**: Northern residential suburb representing newer residential sprawl along the northern exit.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

### 45. مدينة البشير السكنية (Bashir Residential City) — `bashir-city`

- **Sector**: `north_expansion` | **Type**: `commonly_used` | **Confidence**: `high`
- **Aliases**: `مدينة البشير`, `Bashir City`
- **Coordinates**: `19.646, 37.185` (Radius: 1 km)
- **Description**: Organized residential housing development in the north-western perimeter.
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **0** (0.0% of city total)
  - Core Furnished / Hotel Apartments: **0**
  - Hotels: **0** | Resorts: **0** | Real Estate Agencies: **0**
  - Live Mkan Listings: **0** (0.0% of city portfolio)
  - Phone-Reachable Leads: **0**
  - Priority Score: **0/100** (`LOW_PRIORITY`)

