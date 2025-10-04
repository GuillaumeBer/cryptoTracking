from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    try:
        # 1. Navigate to the frontend application
        page.goto("http://localhost:3000")

        # 2. Wait for the main heading to be visible
        expect(page.get_by_role("heading", name="DeFi Borrowed Positions")).to_be_visible(timeout=30000)

        # 3. Wait for the data to be loaded by checking for the "Total Borrowed" text
        expect(page.get_by_text("Total Borrowed (All Chains)")).to_be_visible(timeout=60000)

        # 4. Take a screenshot to verify the rendered content
        page.screenshot(path="/app/jules-scratch/verification/verification.png")

        print("Screenshot taken successfully.")

    except Exception as e:
        print(f"An error occurred: {e}")
        page.screenshot(path="/app/jules-scratch/verification/error.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)