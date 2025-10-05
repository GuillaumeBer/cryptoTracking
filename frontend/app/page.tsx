'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#0a0a0a] dark:to-[#1a1a1a] flex items-center justify-center p-4">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent mb-4">
            Crypto Portfolio Tracker
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Monitor your DeFi positions and trading activity
          </p>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Borrowing Positions Card */}
          <Link href="/borrowing">
            <div className="group bg-gradient-to-br from-white to-gray-50 dark:from-[#1a1a1a] dark:to-[#0f0f0f] border border-gray-200 dark:border-gray-800 rounded-2xl p-8 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 cursor-pointer">
              <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Borrowing Positions
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Track your lending positions across Morpho, AAVE, and Jupiter protocols
              </p>
              <div className="flex items-center text-blue-600 dark:text-blue-400 font-semibold group-hover:translate-x-2 transition-transform">
                View Positions
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Hyperliquid Short Positions Card */}
          <Link href="/hyperliquid">
            <div className="group bg-gradient-to-br from-white to-gray-50 dark:from-[#1a1a1a] dark:to-[#0f0f0f] border border-gray-200 dark:border-gray-800 rounded-2xl p-8 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 cursor-pointer">
              <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-500 to-pink-500 rounded-xl mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Hyperliquid Shorts
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Monitor your short positions and liquidation risk on Hyperliquid
              </p>
              <div className="flex items-center text-red-600 dark:text-red-400 font-semibold group-hover:translate-x-2 transition-transform">
                View Positions
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Real-time monitoring with auto-refresh • Multi-chain support
          </p>
        </div>
      </div>
    </div>
  );
}
