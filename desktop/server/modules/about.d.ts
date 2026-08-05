/**
 * About page — sab se pehle customer ko dikhne wala page.
 *
 * Do tarah ki info merge hoti hai:
 *   1. License se (read-only) — customer_name, expiry, days_left, state
 *   2. Settings se (admin-editable) — welcome_message, plan, email,
 *      start_date, support_contact, custom_message
 */
export declare const aboutRouter: import("express-serve-static-core").Router;
