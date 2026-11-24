# imMBA Market — Testing & Verification Report

Course: AI-Assisted Digital Product Development · Vibe Coding VI (24 Nov 2026) · Georgii Zhukov F15381061
System under test: imMBA Market (`market.html`, `admin-transactions.html`, database rules in `supabase/marketplace.sql` + `marketplace_v2.sql`).

> **Test it. Break it. Fix it. Verify it.** Testing types 1–10 from the lecture are covered. **11. Regression testing was intentionally not done** (excluded on purpose for this assignment). Type 8 (peer UAT) is done by the assigned classmates; a first-time-user walkthrough was simulated in the browser tests instead.

## Summary

| | Test cases | Passed |
|---|---|---|
| Database tests (`tests/db-tests.sql`, run on the live Supabase database inside a transaction that is rolled back) | 53 | 53 |
| Browser tests (`tests/ui-tests.js`, real Chromium with a fake backend): 39 in English + 17 in Chinese | 56 | 56 |
| **Total (after fixes)** | **109** | **109** |

## Break it → Fix it: problems found and fixed

| # | Found by (test type) | Problem (before) | Fix | Verified by |
|---|---|---|---|---|
| 1 | 5 Negative | Database errors were shown to users as raw SQL text, e.g. `violates check constraint "market_cart_qty_check"`. | Every database/auth error is translated into plain English ("Quantity must be between 1 and 1,000."). | Browser #25 |
| 2 | 9 Security | Password only needed 6 characters; `123456` or `password` were accepted. | At least 8 characters, letters **and** numbers, common passwords refused, live strength meter, confirm-password field. | Browser #8–12 |
| 3 | 9 Security | The market page had no **Forgot password** at all. | “Forgot password?” sends a reset link; the link opens a “Choose a new password” form. | Browser #7, #14 |
| 4 | 9 / 10 | Logging in before confirming the email gave a vague error and no way to get a new link. | Clear message + “Resend confirmation email” button; message after registration says where the email went; expired links explained. | Browser #5, #6, #13 |
| 5 | 6 Boundary | Quantity 0 or -1 was silently changed to 1; quantity above stock was silently cut down. | Clear messages: “Choose at least 1.”, “Enter a whole number.”, “Only 5 available.”, “…you already have 5 in your cart.” | Browser #15–21 |
| 6 | 6 Boundary | Found while re-testing: the browser’s own number check blocked the form, so users only saw a small browser tooltip. | Forms use the app’s own validation and messages (`novalidate`). | Browser #15–18, #36 |
| 7 | 5 Negative | “Place order” was only protected by disabling the button. | Added a second lock in the code (“Placing order…”); the database also refuses a second order from an empty cart. | Browser #23, Database #13 |
| 8 | 7 Usability | On phones the cart was below all products — a first-time buyer could not find it. | “🛒 Shopping cart” button in the account box + sticky cart bar at the bottom of the phone screen. | Browser #22, #26–27 |
| 9 | 7 Usability | Found in screenshots: “View cart” scrolled the cart under the fixed site header. | Cart scrolls to just below the header. | Browser #27 + screenshot |
| 10 | 7 Usability | After a successful sign-up the “Create account” button stayed active (easy to register twice). | Button hidden after success. | Screenshot |
| 11 | 9 Security | No feedback for login status. | Messages for logged in / logged out / password saved / email confirmed. | Not covered by an automated test |

## Bug or missing requirement? (not fixable in code alone)

| Item | Status | What is needed |
|---|---|---|
| Order confirmation / shipping **email** | Missing requirement. The system notifies inside the site (bell + message for every order event), but sends no email for orders. | An email-sending service with an API key (e.g. Resend or SendGrid) connected through a Supabase Edge Function. |
| Registration confirmation and password-reset emails | Working — sent by Supabase Auth. | — |
| Server-side password rule (8+ characters) and leaked-password protection | The page enforces the rule; the Supabase server still accepts 6+ characters from other clients. | Supabase Dashboard → Authentication → Policies/Settings: set minimum length 8, require letters + digits, turn on leaked-password protection. |
| 8. Peer user acceptance testing | Done by assigned classmates (Test Assignment slide). | Classmates test the site as Buyer and Seller and report confusing or missing functions. |
| 11. Regression testing | Not done on purpose (excluded from this assignment). | — |

## One test, one theory

| C2C test | Testing concept | Result |
|---|---|---|
| Add item to cart | Functional | PASS (Database #4, Browser #20) |
| Buyer order appears to seller | Integration | PASS (Database #15–17) |
| Complete full transaction | End-to-end | PASS (Database #20–25) |
| Buyer opens seller/admin page | Access control | PASS (Database #18, #28–43, Browser #38) |
| Quantity = 0 | Negative / Boundary | PASS (Database #5, Browser #15) |
| First-time user completes purchase | Usability / UAT | PASS (Browser #2, #20–24, #26–27) |
| Forgot password | Security-related | PASS (Browser #7, #14) |
| Order confirmation | Notification | PASS in-site (Database #17, #22, Browser #24, #29–30); email = missing requirement |
| Test again after AI fix | Regression | Not done (excluded) |

## Test cases by type

Format from the lecture: **Action → Expected → Actual → Result.** “Actual” is the real output of the test run.

### Chinese (中文) support

The Market follows the site's 中文 / EN button (Chinese is the default, like the rest of the site; the choice is remembered). Everything a user sees is translated: page texts, buttons, forms, validation and error messages, confirmations, order statuses, and even the order notifications that the database writes in English (they are translated when shown). Back-office pages (`admin-*.html`) stay English on purpose, like all other back-office pages. Browser tests #40–#56 (type "12 Chinese") check: default language, product cards, no English left over on the visitor / buyer / seller screens, login + password errors, quantity errors, order confirmation, translated notification, live switching 中文 ⇄ EN.

### 1. Functional testing

| # | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #2 | Seller creates a product listing | listing saved, seller name filled in | saved: seller_name=Test Seller, qty=3 | **PASS** |
| Database #3 | Seller updates inventory (3 → 5) | quantity 5 | qty=5 | **PASS** |
| Database #4 | Buyer adds a product to the cart | product appears in cart | in cart, qty 2 | **PASS** |
| Database #39 | Visitor can browse listed products | listed products visible | 2 test products visible | **PASS** |
| Browser #1 | Visitor browses products | product cards shown | 3 cards | **PASS** |
| Browser #20 | Buyer adds a product to the cart | product appears in cart | imMBA Laptop Sleeve | **PASS** |
| Browser #39 | No JavaScript errors on any page | 0 errors | 0 error(s) | **PASS** |

### 2. Integration testing

| # | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #11 | Buyer places order → database creates order | 1 order, subtotal 125,000 + delivery 80 | 1 order, subtotal 125000, shipping 80, total 125080 | **PASS** |
| Database #12 | Cart is emptied after the order | 0 items in cart | 0 | **PASS** |
| Database #15 | Seller sees the buyer's order | order visible to seller, status waiting for payment | pending_payment | **PASS** |
| Database #16 | Inventory changes after the order | stock 5 → 0 | 0 | **PASS** |
| Database #27 | Buyer cancels while waiting for payment → stock returns | cancelled, mug stock back to 1 | cancelled; stock 1 | **PASS** |

### 3. System / end-to-end testing

| # | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #20 | Seller confirms payment | ready_to_ship | ready_to_ship | **PASS** |
| Database #21 | Seller ships | shipped | shipped | **PASS** |
| Database #23 | Buyer confirms receipt → completed | completed | completed | **PASS** |
| Database #25 | Completed order stays in buyer history | visible to buyer | completed | **PASS** |

### 4. Access control testing

| # | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #18 | Buyer tries to confirm payment | refused | This step is not allowed for this order right now. | **PASS** |
| Database #26 | Buyer cannot delete or edit an order directly | refused | permission denied for table market_orders | **PASS** |
| Database #28 | Buyer edits another seller's product | 0 rows changed | 0 rows | **PASS** |
| Database #29 | Buyer deletes another seller's product | 0 rows deleted | 0 rows | **PASS** |
| Database #30 | Buyer opens the admin member list | refused | Platform admins only. | **PASS** |
| Database #31 | Buyer changes the platform fee | 0 rows changed | 0 rows | **PASS** |
| Database #32 | Buyer reads other people's profiles | only own profile | 1 profile(s) visible | **PASS** |
| Database #33 | Another buyer reads this buyer's orders | 0 orders visible | 0 | **PASS** |
| Database #34 | Another buyer reads this buyer's notifications | 0 visible | 0 | **PASS** |
| Database #35 | Seller fakes another seller as owner (seller_id) | refused | permission denied for table market_products | **PASS** |
| Database #36 | Visitor (not logged in) reads orders | refused | permission denied for table market_orders | **PASS** |
| Database #37 | Visitor creates a product | refused | permission denied for table market_products | **PASS** |
| Database #38 | Visitor places an order | refused | permission denied for function market_place_order | **PASS** |
| Database #40 | Platform admin monitors all transactions | sees every order | 2 test orders visible | **PASS** |
| Database #41 | Platform admin cannot edit an order (monitoring only) | refused | permission denied for table market_orders | **PASS** |
| Database #42 | Platform admin suspends a seller | suspended, seller's listings hidden | suspended; listed items left: 0 | **PASS** |
| Database #43 | Suspended seller tries to list a product | refused | new row violates row-level security policy | **PASS** |
| Browser #2 | Visitor clicks “Add to cart” | asked to log in (cannot buy) | dialog: "Log in" | **PASS** |
| Browser #38 | Buyer types the admin URL (admin-transactions.html) | blocked, no transactions shown | "Market account", admin area visible: false | **PASS** |

### 5. Positive and negative testing

| # | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #9 | Unknown shipping method | rejected | Unknown shipping method. | **PASS** |
| Database #13 | Click "Place order" twice | second click refused, still only 1 order | Your cart is empty. / orders: 1 | **PASS** |
| Database #19 | Seller ships before payment is confirmed | refused | This step is not allowed for this order right now. | **PASS** |
| Database #24 | Cancel a completed order | refused | This step is not allowed for this order right now. | **PASS** |
| Database #49 | Seller saves a product with an empty name | rejected | rejected: violates market_products_name_check | **PASS** |
| Database #50 | Seller buys their own product | refused | You cannot buy your own product (Own item). | **PASS** |
| Database #51 | Place an order with an empty cart | refused with a clear message | Your cart is empty. | **PASS** |
| Browser #3 | Log in with empty email | clear message | Enter your email address. | **PASS** |
| Browser #4 | Log in with wrong password | “Wrong email or password.” | Wrong email or password. | **PASS** |
| Browser #11 | Passwords do not match | rejected | The two passwords do not match. | **PASS** |
| Browser #23 | Click “Place order” twice (fast) | only one order request | 1 request(s) | **PASS** |
| Browser #25 | Database rejects a value (cart quantity 1001) | plain-English message, no SQL text | Quantity must be between 1 and 1,000. | **PASS** |
| Browser #35 | Seller saves with an empty name | refused | Give the product a name. | **PASS** |

### 6. Boundary value testing

| # | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #5 | Cart quantity = 0 | rejected | rejected: violates market_cart_qty_check | **PASS** |
| Database #6 | Cart quantity = -1 | rejected | rejected: violates market_cart_qty_check | **PASS** |
| Database #7 | Cart quantity = 1001 (above the 1000 limit) | rejected | rejected: violates market_cart_qty_check | **PASS** |
| Database #8 | Order quantity > available stock (6 > 5) | order refused, nothing sold | Only 5 left of "Test Laptop". | **PASS** |
| Database #10 | Order quantity = maximum stock (5 of 5) | order placed, stock becomes 0 | placed; stock now 0 | **PASS** |
| Database #14 | Buy a product with stock = 0 | cannot be ordered | Only 0 left of "Test Laptop". | **PASS** |
| Database #44 | Seller sets stock = -1 | rejected | rejected: violates market_products_quantity_check | **PASS** |
| Database #45 | Seller sets stock = 0 (sold out) | allowed | saved; stock 0 | **PASS** |
| Database #46 | Seller sets price = -1 | rejected | rejected: violates market_products_price_check | **PASS** |
| Database #47 | Seller sets price = 0 (free item) | allowed | saved; price 0 | **PASS** |
| Database #48 | Seller sets price = 10,000,001 (above maximum) | rejected | rejected: violates market_products_price_check | **PASS** |
| Browser #15 | Quantity = 0 | refused with a clear message | Choose at least 1. | **PASS** |
| Browser #16 | Quantity = -1 | refused with a clear message | Choose at least 1. | **PASS** |
| Browser #17 | Quantity = 1.5 | refused with a clear message | Enter a whole number. | **PASS** |
| Browser #18 | Quantity > available stock (6 of 5) | refused with a clear message | Only 5 available. | **PASS** |
| Browser #19 | Quantity = maximum stock (5 of 5) | added to cart | cart: [{"product_id":"p2","qty":5}] | **PASS** |
| Browser #21 | Add one more when the cart already holds all stock | refused, explains why | Only 5 available — you already have 5 in your cart. | **PASS** |
| Browser #31 | Seller price = -1 | refused with the allowed range | Price must be a whole number from NT$0 to NT$10,000,000. | **PASS** |
| Browser #32 | Seller price = 10,000,001 | refused with the allowed range | Price must be a whole number from NT$0 to NT$10,000,000. | **PASS** |
| Browser #33 | Seller quantity = -1 | refused with the allowed range | Quantity must be a whole number from 0 to 100,000. | **PASS** |
| Browser #34 | Seller quantity = 100,001 | refused with the allowed range | Quantity must be a whole number from 0 to 100,000. | **PASS** |
| Browser #36 | Seller updates stock to -1 | refused | Stock must be a whole number from 0 to 100,000. | **PASS** |

### 7. Usability testing

| # | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Browser #22 | First-time user can find the cart | “Shopping cart” button in the header box | 🛒 Shopping cart5 item(s) → | **PASS** |
| Browser #26 | Phone: cart can be found without scrolling | sticky cart bar at the bottom | 2 item(s) in cart · NT$1,800 | **PASS** |
| Browser #27 | Phone: “View cart” jumps to the cart | cart scrolled into view | cart top at 156px | **PASS** |
| Browser #28 | Phone: no sideways scrolling | page width 390px | 390px | **PASS** |
| Browser #37 | “Payment received” wording is clear | payment status shown in words | Payment: waiting for confirmation / received | **PASS** |

### 9. Security-related testing

| # | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #1 | New market sign-up gets role "member" (not a back-office request) | member | member | **PASS** |
| Database #52 | Account with unconfirmed email lists a product | refused until email is verified | new row violates row-level security policy | **PASS** |
| Database #53 | Account with unconfirmed email places an order | refused until email is verified | Log in with a confirmed email to place an order. | **PASS** |
| Browser #5 | Log in before confirming the email | explains + offers “Resend confirmation email” | Your email is not confirmed yet. Open the link in the confir… | **PASS** |
| Browser #7 | Forgot password → request reset link | reset email requested + message shown | If this email has an account, a reset link is on its way. Check your inbox (and spam). | **PASS** |
| Browser #8 | Password too short (abc1) | rejected with the rule | Use at least 8 characters. | **PASS** |
| Browser #9 | Password without numbers (abcdefgh) | rejected with the rule | Use both letters and numbers. | **PASS** |
| Browser #10 | Common password (password1) | rejected with the rule | This password is too common. Choose another one. | **PASS** |
| Browser #12 | Strength meter on a good password | shows Good/Strong | Good | **PASS** |
| Browser #14 | Open the reset link from the email | “Choose a new password” form | Choose a new password | **PASS** |

### 10. System feedback & notification testing

| # | Action | Expected | Actual | Result |
|---|---|---|---|---|
| Database #17 | Order confirmation → seller notified | notification "New order …" | New order #… from Test Buyer (NT$125,080). Confirm the payment when you receive it. | **PASS** |
| Database #22 | Payment confirmation + shipping notification reach the buyer | 2 notifications | Test Seller confirmed your payment… \| Order … has been shipped… | **PASS** |
| Browser #6 | Resend confirmation email | confirmation that it was sent | A new confirmation email was sent to new@example.com. Click the link inside, then log in. | **PASS** |
| Browser #13 | Registration confirmation | tells the user to confirm the email | Registration received. We sent a confirmation email to student@example.com. Click the link inside, then log in. | **PASS** |
| Browser #24 | Order confirmation message | visible confirmation after placing | Order placed (1 order). The seller has been notified: follow the status under “My orders”. | **PASS** |
| Browser #29 | Seller sees a new-order notification | bell shows 1 unread | badge: 1 | **PASS** |
| Browser #30 | Open notifications | message “New order …” | New order #abcd1234 from Test Buyer (NT$900). Confirm the payment when you receive it. | **PASS** |

### 8. User acceptance testing (simulated first-time user)

A new visitor: browses → is asked to log in when adding to cart → registers (password rules shown while typing) → gets a clear “check your email” message → (after confirming) adds an item, finds the cart from the header or the phone bar → places an order → sees “Order placed … follow the status under My orders” and the payment instructions → the seller gets a bell notification → seller confirms payment, ships, completes → both see the completed order in their history. Covered by Browser #1–#30 and Database #2–#27.

## How to run the tests again

**Database tests:** open Supabase → SQL Editor, paste `tests/db-tests.sql`, run. It creates test users/products/orders, checks every rule, prints a PASS/FAIL table, then rolls everything back (nothing is kept).

**Browser tests:** in the project folder run `python3 -m http.server 8765`, then `npm i playwright @supabase/supabase-js@2.49.4 @tailwindcss/browser@4` and `node tests/ui-tests.js`. Screenshots and `results.json` go to `test-screenshots/`.
