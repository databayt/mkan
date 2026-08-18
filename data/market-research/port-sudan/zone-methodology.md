# Port Sudan Comprehensive Zones & Supply Density Methodology

> Technical documentation of data discovery, normalization, spatial assignment, density calculations, and scoring algorithms.

---

## 1. Geographic Discovery & Boundary Principles

Port Sudan locality officially comprises three administrative units (*وحدة بورتسودان وسط*, *جنوب*, *شرق*), plus planned residential expansion grids (*المربعات*) and the northern coastal tourism corridor.

### Sources Swept:
1. **OpenStreetMap (Overpass API)**: Queried for nodes with `place`, `amenity=marketplace`, `railway=station`, `aeroway=aerodrome`, and `tourism` facilities within bounding box `19.40, 37.00, 20.10, 37.40`.
2. **Directory Mirror (sd.arabplaces.com)**: Verified business listings carrying Google Maps ratings, reviews, and precise coordinates.
3. **Local Classifieds & Real Estate Listings**: Swept Alsoug, OpenSooq, Facebook broker groups, and municipal records.
4. **Historical & Academic Urban Studies**: Sudanese urban geography records (Sudanile, Marefa, Red Sea University).
5. **Mkan Live Snapshot**: Exact location coordinates of Mkan's 29 published listings in Port Sudan.

---

## 2. Spatial Assignment Algorithm

Because polygon boundaries do not exist, zones are modeled as radial centroids $(lat_i, lng_i, r_i)$.

### Step 1: Centroid Proximity Ratio
For any lead or listing coordinate $(lat, lng)$:
1. Calculate great-circle Haversine distance $d_i = \text{haversine}(lat, lng, lat_i, lng_i)$.
2. Calculate normalized ratio $r_i = d_i / r_i$.
3. Match to candidate zone where $r_i \le 1.0$ and $r_i = \min_j(r_j)$.

### Step 2: Quality & Fallback Rules
- **Placeholder Centroid Trap**: If $(lat, lng) = (19.6158, 37.2164)$ (the default fallback centroid), forced to `unknown` (`placeholder_city_centroid`).
- **Address Text Fallback**: If coordinates are missing or unzoned, match Arabic/English address and area strings against zone aliases.
- **Confidence Scoring**:
  - `high`: $d_i \le 0.4\text{ km}$ or exact address string match.
  - `medium`: $0.4\text{ km} < d_i \le 0.9\text{ km}$.
  - `low`: $0.9\text{ km} < d_i \le r_i$.
  - `unknown`: Unplaced / fallback.

---

## 3. Density & Metrics Formulas

### Supply Concentration:
$$\text{zone\_share} = \frac{\text{discovered\_businesses}_{\text{zone}}}{\text{total\_discovered\_businesses}}$$

$$\text{mkan\_share} = \frac{\text{mkan\_listings}_{\text{zone}}}{\text{total\_mkan\_listings}}$$

---

## 4. Transparent Acquisition Scoring Formula

$$\text{Score} = \min(35, 7 \times N_{\text{core}}) + \min(20, 4 \times N_{\text{hotel/resort}}) + \min(25, 5 \times N_{\text{phone}}) + \min(10, 2 \times N_{\text{mkan}}) + \text{ReviewPts}$$
