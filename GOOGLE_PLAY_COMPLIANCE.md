# Google Play Store Publishing & Compliance Guide for Miru Manga

**Developer:** Kiel Studio Devs  
**App Name:** Miru Manga - Comic Reader  
**Package ID:** `com.kielstudio.mirumanga`  
**Support & DMCA Contact:** `kielstudio.dev@gmail.com`  
**Hosted Privacy Policy URL:** `https://kielstudio-dev.github.io/miru-manga/privacy.html`

---

## 1. Google Play Console Account Overview
* **Developer Registration Fee:** **$25 USD (One-time payment)**.
* **App Limit:** **Unlimited apps**. You only pay the $25 registration once; you do NOT pay per app. Once your Google Play Console account is verified, you can publish Miru Manga and all future applications under the same account.

---

## 2. Store Listing Information

### App Title (Max 30 characters)
```text
Miru Manga - Comic Reader
```

### Short Description (Max 80 characters)
```text
Modern comic & manga reader with offline reading, webtoon scroll & cloud sync.
```

### Full Description (Play Store Listing)
```markdown
Miru Manga is a fast, versatile, and elegant comic and webtoon reader engineered for manga fans, digital comic enthusiasts, and manhwa readers. Designed with modern aesthetics and fluid performance, Miru Manga provides an all-in-one reader engine for your personal comic archive.

🌟 KEY FEATURES:

📖 High-Performance Reader Engine
• Continuous Webtoon Vertical Scroll: Seamlessly read full-color Korean manhwa and webtoons without page stutter.
• Single Page & Double Page Modes: Traditional Japanese right-to-left (RTL) manga reading experience.
• Custom Reader Canvas: Choose from pure AMOLED Black, Dark Slate, or Light reading backgrounds with border cropping and zoom support.

📁 Personal Comic Archive Manager
• Universal Offline Support: Import your own `.cbz`, `.cbr`, and `.zip` comic files directly from your phone's storage.
• Offline Chapter Downloads: Save chapters to local memory for distraction-free reading on flights, subways, or offline commutes.

☁️ Seamless Cloud Sync & Bookmarks
• Cross-Device Library: Bookmark your favorite series and pick up right where you left off on any Android device.
• Library Backup & Restore: Export your complete reading progress, bookmarks, and settings to a portable JSON file anytime.
• Safe Google Sign-In: Link your Google account to protect your reading library with automatic cloud backup.

🧩 Modular Community Extension Catalog
• Access dozens of verified community extension repositories with rich metadata, category sorting, and fast CDN image loading.
• Customizable sources with independent repository URLs and instant search across tens of thousands of series.

🛡️ Privacy-First & Independent Media Player
• Read anonymously by default without forced registration.
• No intrusive tracking or background data selling.
• Complete user ownership with 1-tap cache purging and instant library export.

Download Miru Manga today and elevate your digital reading experience!
```

---

## 3. Play Console Policy & Questionnaire Answers

### 1. Privacy Policy
* **URL:** `https://kielstudio-dev.github.io/miru-manga/privacy.html`

### 2. App Access (Reviewer Instructions)
* Select: **"All functionality is available without special access restrictions"**
* *Reviewer Note:* The app defaults to an anonymous Guest Session. Pro features can be tested immediately using the "Test Pro Mode" toggle in Settings without making a live payment.

### 3. Ads
* Select: **"Yes, my app contains ads"** (Non-intrusive AdMob banners for free-tier users, disabled for Pro users).

### 4. Content Rating (IARC Questionnaire)
* **Category:** Utility, Productivity, Communication, or Entertainment.
* **Does the app contain violence or blood?** Select "Yes, mild/infrequent in user-loaded comic artwork".
* **Does the app contain mature/sexual content?** Select "Yes, optional/user-loaded adult content".
* **Recommended Age Rating:** **Teen (13+) or Mature (17+/18+)**.
  * *Important:* Setting the app target to **18+** ensures smooth Play Store approval without risking COPPA child-safety rejections, aligning with our in-app age gate verification dialog.

### 5. Target Audience & Content
* Select: **18 and older**.
* *Could your app appeal to children?* Select: **No**.

### 6. Data Safety Form
* **Does your app collect or share user data?** Select **Yes**.
* **Is data encrypted in transit?** Select **Yes** (HTTPS/SSL).
* **Do you provide a way for users to request data deletion?** Select **Yes** (in-app sign-out + email `kielstudio.dev@gmail.com`).
* **Data Types Collected:**
  1. *Email Address:* (Optional, collected solely when user links Google Sign-In for cloud library sync).
  2. *Device or other IDs:* (Anonymous user UUID generated locally for bookmark persistence).
  3. *App Diagnostics:* (Anonymous crash logs for bug fixing).
* **Data Shared:** **None** (Miru Manga never sells or shares user data with third parties).

### 7. Financial Features / In-App Purchases
* Declare: **In-app purchases supported** (One-time Lifetime Pro upgrade processed via Google Play In-App Billing).

---

## 4. Legal Architecture Defense (Tachiyomi / Mihon Precedent)
* **Neutral Media Player Defense:** Miru Manga is distributed with **0 copyrighted media files** in its default bundle. The default demo is David Revoy's *Pepper & Carrot* (100% legal Creative Commons BY 4.0).
* **Community Model:** Scrapers are NOT bundled in the core APK binary. Extensions are fetched dynamically from community repositories (Mihon legal architecture).
* **DMCA Safe Harbor:** A formal DMCA procedure is displayed in `Settings` and `docs/privacy.html` with designated agent email `kielstudio.dev@gmail.com` fulfilling 17 U.S.C. § 512 requirements.
