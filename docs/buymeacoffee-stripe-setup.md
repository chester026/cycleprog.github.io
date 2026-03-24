# Buy Me a Coffee + Stripe Setup Guide (Cyprus)

## Step 1: Create Buy Me a Coffee Account

1. Go to [buymeacoffee.com](https://www.buymeacoffee.com)
2. Click **Sign Up** → sign up with email or Google
3. Choose your **username** (e.g. `bikelab`) — this becomes your page URL: `buymeacoffee.com/bikelab`
4. Select **Creator** account type

## Step 2: Configure Your Page

### Profile
- **Name**: BikeLab
- **Avatar**: App icon
- **About**: Keep it concise and genuine:

> BikeLab is an AI-powered cycling analytics app built by a solo developer. It connects to Strava and helps cyclists track performance, set smart goals, and maintain their bikes. Your support helps cover server costs and keeps the app free for everyone.

### Coffee Price
- Default is $5 — good starting point
- Users can choose to buy 1, 3, or 5 "coffees" at once
- You can customize the emoji (coffee → bike, wheel, etc.)

### Optional: Membership Tiers
Skip for now. Focus on one-time donations first. You can add tiers later.

## Step 3: Connect Stripe (Payments)

### Prerequisites
- Cyprus bank account (EUR, IBAN starting with CY)
- Valid passport or Cyprus ID card
- Proof of address (utility bill, bank statement — last 3 months)
- Phone number
- Email address

### Setup Process

1. On Buy Me a Coffee dashboard → **Settings** → **Payouts**
2. Click **Connect with Stripe**
3. You'll be redirected to Stripe onboarding

### Stripe Onboarding Steps

#### 3a. Account Type
- Select **Individual / Sole Proprietor**
- Country: **Cyprus**
- No business registration needed

#### 3b. Personal Information
- Legal name (as on passport)
- Date of birth
- Address (Cyprus address)
- Phone number
- Last 4 digits of passport/ID number

#### 3c. Bank Account
- Currency: **EUR**
- IBAN: your Cyprus bank account (CY...)
- Bank name will auto-fill from IBAN

#### 3d. Identity Verification
- Upload **passport** (photo page) or **Cyprus ID** (front + back)
- Upload **proof of address**: bank statement or utility bill
- Both documents must show your name and Cyprus address
- Photos must be clear, all corners visible

#### 3e. Business Details
- Business type: **Individual**
- Industry: **Software** or **Mobile Apps**
- Website: your app's support URL or landing page
- Product description: "Cycling analytics mobile application — voluntary donations"

### Verification Timeline
- Usually **instant** to **24 hours**
- Sometimes Stripe asks for additional documents — check email
- You can receive payments even while verification is pending (with payout delay)

## Step 4: Configure Payout Settings

1. In Buy Me a Coffee → **Settings** → **Payouts**
2. Payout method: **Stripe** (already connected)
3. Payout schedule:
   - **Manual** — you withdraw when you want (recommended to start)
   - **Automatic** — weekly or monthly
4. Minimum payout: **$1**

## Step 5: Test Everything

1. Open your page: `buymeacoffee.com/YOUR_USERNAME`
2. Buy yourself a coffee using a different card (Stripe test mode not available through BMC)
3. Verify the payment appears in your BMC dashboard
4. Verify Stripe dashboard shows the transaction

## Fees Summary

| Fee Type | Amount |
|----------|--------|
| Buy Me a Coffee | **5%** of each transaction |
| Stripe (EU cards) | **1.5%** + €0.25 |
| Stripe (non-EU cards) | **2.5%** + €0.25 |
| Currency conversion | **1%** (if donor pays in non-EUR) |
| Withdrawal to bank | **Free** |

Example: Someone donates $5 (≈ €4.60)
- BMC fee: €0.23
- Stripe fee: €0.32
- **You receive: ≈ €4.05**

## Step 6: Integration in App

The donation page URL for the app:
```
https://www.buymeacoffee.com/YOUR_USERNAME
```

This link will be used in the app banners with `Linking.openURL()`.

## Useful Links

- BMC Dashboard: https://www.buymeacoffee.com/dashboard
- Stripe Dashboard: https://dashboard.stripe.com
- Stripe Cyprus docs: https://stripe.com/cy
- BMC Help Center: https://help.buymeacoffee.com

## Notes

- **No business registration required** — Stripe accepts individuals on Cyprus
- **Tax**: Donations are technically income. Under €19,500/year is tax-free on Cyprus (personal income tax threshold). Consult an accountant if amounts grow.
- **Apple compliance**: Since the app is free and donations don't unlock features, external donation links are allowed per App Store guidelines 3.2.2.
- **Keep receipts**: Stripe provides automatic receipts to donors and transaction history for you.
