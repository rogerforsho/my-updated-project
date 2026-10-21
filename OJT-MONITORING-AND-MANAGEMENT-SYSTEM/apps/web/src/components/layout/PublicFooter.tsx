'use client';

import React, { useState, useEffect } from 'react';

type ActiveModal = 'privacy' | 'terms' | 'faqs' | 'developers' | null;
type FaqCategory = 'student' | 'coordinator' | 'supervisor' | 'technical';

export default function PublicFooter() {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [activeFaqTab, setActiveFaqTab] = useState<FaqCategory>('student');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  // Close modal on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setActiveModal(null);
      }
    }
    if (activeModal) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [activeModal]);

  const openModal = (modal: ActiveModal) => {
    setActiveModal(modal);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  return (
    <>
      {/* 🟢 Plain & Minimal Facebook-Style Footer */}
      <footer className="w-full bg-white text-slate-500 border-t border-slate-200 py-6 sm:py-8 text-xs select-none">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {/* Row 1: Primary Navigation & Guides */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Resources:</span>
            <button
              onClick={() => {
                setActiveFaqTab('student');
                openModal('faqs');
              }}
              className="hover:underline hover:text-slate-900 cursor-pointer"
            >
              Student Trainee Guide
            </button>
            <span className="text-slate-300">•</span>
            <button
              onClick={() => {
                setActiveFaqTab('coordinator');
                openModal('faqs');
              }}
              className="hover:underline hover:text-slate-900 cursor-pointer"
            >
              OJT Coordinator Manual
            </button>
            <span className="text-slate-300">•</span>
            <button
              onClick={() => {
                setActiveFaqTab('supervisor');
                openModal('faqs');
              }}
              className="hover:underline hover:text-slate-900 cursor-pointer"
            >
              Company Supervisor Guide
            </button>
            <span className="text-slate-300">•</span>
            <button
              onClick={() => {
                setActiveFaqTab('technical');
                openModal('faqs');
              }}
              className="hover:underline hover:text-slate-900 cursor-pointer"
            >
              Help & FAQs
            </button>
            <span className="text-slate-300">•</span>
            <a
              href="/downloads/CdM-OJT-Portal-Setup-1.0.0.exe"
              download="CdM-OJT-Portal-Setup-1.0.0.exe"
              className="hover:underline hover:text-slate-900 font-medium text-slate-700"
            >
              Windows Desktop Client (.exe)
            </a>
            <span className="text-slate-300">•</span>
            <a
              href="mailto:ojt-support@cdm.edu.ph"
              className="hover:underline hover:text-slate-900"
            >
              Support: ojt-support@cdm.edu.ph
            </a>
          </div>

          {/* Clean Subtle Divider Line */}
          <div className="border-t border-slate-200 my-3" />

          {/* Row 2: Governance, Policies & Development Credits */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
            <button
              onClick={() => openModal('privacy')}
              className="hover:underline hover:text-slate-800 cursor-pointer"
            >
              Privacy Policy (RA 10173)
            </button>
            <button
              onClick={() => openModal('terms')}
              className="hover:underline hover:text-slate-800 cursor-pointer"
            >
              Terms of Service
            </button>
            <button
              onClick={() => openModal('privacy')}
              className="hover:underline hover:text-slate-800 cursor-pointer"
            >
              Biometric & GPS Retention Policy
            </button>
            <button
              onClick={() => openModal('terms')}
              className="hover:underline hover:text-slate-800 cursor-pointer"
            >
              CHED CMO 104 Compliance
            </button>
            <button
              onClick={() => openModal('developers')}
              className="hover:underline hover:text-slate-800 cursor-pointer font-medium text-slate-700"
            >
              Meet the Developers
            </button>
            <span className="text-slate-400">
              ISO/IEC 25010:2023 Evaluated
            </span>
            <span className="text-slate-400">
              System Status: Operational (v1.2.0)
            </span>
          </div>

          {/* Row 3: Institutional Copyright & Office Info */}
          <div className="mt-3 pt-2 text-[11px] text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
            <p>
              Colegio de Montalban &copy; {new Date().getFullYear()} &bull; Institute of Computing Studies &bull; Institute of Business &amp; Entrepreneurship &bull; Kasiglahan Village, Rodriguez, Rizal 1860
            </p>
            <p>
              Research &amp; Development Team: Ralph Roger Vicente, Jay-e Baui, Jovelyn Golis, Jomar Suralta
            </p>
          </div>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* 🛡️ MODAL 1: PRIVACY POLICY (REPUBLIC ACT 10173) */}
      {/* ========================================================================= */}
      {activeModal === 'privacy' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Institutional Privacy Policy</h3>
                <p className="text-[11px] text-slate-500">
                  Republic Act No. 10173 (Data Privacy Act of 2012 of the Philippines)
                </p>
              </div>
              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-md hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto px-6 py-5 space-y-4 text-xs leading-relaxed text-slate-600">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs">
                <strong>Commitment to Privacy:</strong> Colegio de Montalban is committed to safeguarding personal, sensitive, and academic data processed within the On-the-Job Training Monitoring & Management Portal.
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">1. Information We Collect</h4>
                <p>In accordance with CHED Memorandum Order (CMO) No. 104, Series of 2017, the system gathers:</p>
                <ul className="list-disc list-inside mt-1 space-y-1 text-slate-600">
                  <li><strong>Trainee Identification:</strong> Student ID number, official name, institutional email address, academic department (ICS / IBE), and program section.</li>
                  <li><strong>Biometric Attendance Data:</strong> Front-camera selfie photographs captured during Time-In and Time-Out for anti-proxy identity verification.</li>
                  <li><strong>Geolocation Coordinates:</strong> GPS latitude, longitude, and workplace distance at the moment of clocking in/out.</li>
                  <li><strong>Practicum Documentation:</strong> Weekly accomplishment reports, Daily Time Records (DTR), and supervisor evaluation rubrics.</li>
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">2. Purpose of Data Processing</h4>
                <p>Data collected is strictly utilized to:</p>
                <ul className="list-disc list-inside mt-1 space-y-1 text-slate-600">
                  <li>Validate student completion of mandatory practicum duty hours (300–600 hours).</li>
                  <li>Prevent fraudulent attendance logs and ensure fair academic compliance.</li>
                  <li>Facilitate academic reporting to the Practicum & Placement Office and Department Chairs.</li>
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">3. Data Security & Storage</h4>
                <p>
                  Database records are governed by PostgreSQL Row-Level Security (RLS) policies. Sensitive media captures are kept in private cloud buckets accessible strictly to authorized OJT Coordinator and designated company supervisors.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">4. Retention & Archival Standards</h4>
                <p>
                  Trainee practicum files are retained for five (5) academic years following student graduation in accordance with higher education recordkeeping standards, after which digital media files are purged.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">5. Data Subject Rights & Contact</h4>
                <p>
                  Trainees have the right to inspect, correct, and request rectification of their practicum records. For inquiries, contact the Data Protection Officer at <span className="font-mono text-slate-800">dpo@cdm.edu.ph</span> or the Practicum Office at <span className="font-mono text-slate-800">ojt-support@cdm.edu.ph</span>.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Colegio de Montalban • Ref: POL-DPA-2026</span>
              <button
                onClick={closeModal}
                className="px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📜 MODAL 2: TERMS OF SERVICE */}
      {/* ========================================================================= */}
      {activeModal === 'terms' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Terms of Service & Code of Conduct</h3>
                <p className="text-[11px] text-slate-500">
                  Practicum Management & Acceptable Use Policy
                </p>
              </div>
              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-md hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto px-6 py-5 space-y-4 text-xs leading-relaxed text-slate-600">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">1. User Agreement</h4>
                <p>
                  By logging into the Colegio de Montalban OJT System, you agree to comply with these Terms of Service, the CdM Student Handbook, and official CHED practicum guidelines.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">2. Academic Integrity & Anti-Spoofing</h4>
                <p>Student trainees are strictly prohibited from:</p>
                <ul className="list-disc list-inside mt-1 space-y-1 text-slate-600">
                  <li>Employing mock location software, GPS spoofers, emulators, or VPN workarounds.</li>
                  <li>Performing proxy check-ins for other students or sharing system credentials.</li>
                  <li>Falsifying attendance hours or forging supervisor evaluation signatures.</li>
                </ul>
                <p className="mt-2 text-rose-600 font-medium">
                  Violations constitute academic dishonesty and are grounds for invalidation of duty hours and disciplinary committee review.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">3. OJT Coordinator & Supervisor Authority</h4>
                <p>
                  OJT Coordinator and Company Supervisors hold the sole authority to review, validate, approve, or reject logged hours based on actual host training performance.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">4. Maintenance & Support</h4>
                <p>
                  The system operates 24/7 with scheduled maintenance announced in advance. For support tickets or login concerns, email <span className="font-mono text-slate-800">ojt-support@cdm.edu.ph</span> or <span className="font-mono text-slate-800">mis@cdm.edu.ph</span>.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Effective Academic Year 2025–2026</span>
              <button
                onClick={closeModal}
                className="px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ❓ MODAL 3: USER GUIDES & FAQS */}
      {/* ========================================================================= */}
      {activeModal === 'faqs' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div>
                <h3 className="text-sm font-bold text-slate-900">User Guides & FAQs</h3>
                <p className="text-[11px] text-slate-500">
                  Operational guidelines for Students, OJT Coordinator, and Supervisors
                </p>
              </div>
              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-md hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {/* Role Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50/40 px-6 gap-2 overflow-x-auto text-xs">
              <button
                onClick={() => { setActiveFaqTab('student'); setExpandedFaq(0); }}
                className={`py-2.5 px-3 font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeFaqTab === 'student'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Students / Trainees
              </button>
              <button
                onClick={() => { setActiveFaqTab('coordinator'); setExpandedFaq(0); }}
                className={`py-2.5 px-3 font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeFaqTab === 'coordinator'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                OJT Coordinator
              </button>
              <button
                onClick={() => { setActiveFaqTab('supervisor'); setExpandedFaq(0); }}
                className={`py-2.5 px-3 font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeFaqTab === 'supervisor'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Company Supervisors
              </button>
              <button
                onClick={() => { setActiveFaqTab('technical'); setExpandedFaq(0); }}
                className={`py-2.5 px-3 font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeFaqTab === 'technical'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Technical & App Support
              </button>
            </div>

            {/* Accordion Questions */}
            <div className="overflow-y-auto px-6 py-5 space-y-2.5 text-xs">
              {activeFaqTab === 'student' && (
                <>
                  <FaqItem
                    question="How do I record my daily Time-In and Time-Out?"
                    answer="Open the Mobile App at your assigned workplace. Tap 'Time In', enable GPS and Camera permissions, and capture a selfie. The app verifies that your GPS coordinates match the company's geofence perimeter and logs your attendance."
                    expanded={expandedFaq === 0}
                    onToggle={() => setExpandedFaq(expandedFaq === 0 ? null : 0)}
                  />
                  <FaqItem
                    question="What should I do if my GPS location drifts or fails to locate?"
                    answer="Move near an open area or window and ensure 'High Accuracy' location mode is enabled in your device settings. If you are on an approved WFH shift, check with OJT Coordinator."
                    expanded={expandedFaq === 1}
                    onToggle={() => setExpandedFaq(expandedFaq === 1 ? null : 1)}
                  />
                  <FaqItem
                    question="How do I submit weekly accomplishment reports?"
                    answer="Go to the 'Reports' tab in your dashboard, select the target week, write your narrative accomplishments, attach documentation photos, and click Submit for OJT Coordinator review."
                    expanded={expandedFaq === 2}
                    onToggle={() => setExpandedFaq(expandedFaq === 2 ? null : 2)}
                  />
                </>
              )}

              {activeFaqTab === 'coordinator' && (
                <>
                  <FaqItem
                    question="How do I approve newly registered student trainees?"
                    answer="Log in to the Web Portal, navigate to 'Student Management', find the 'Pending Approval' list, verify the student's ID number and course, and click 'Approve'."
                    expanded={expandedFaq === 0}
                    onToggle={() => setExpandedFaq(expandedFaq === 0 ? null : 0)}
                  />
                  <FaqItem
                    question="How do I set up or adjust company geofence coordinates?"
                    answer="In the Companies directory, select the company and click 'Edit'. You can place a pin on the interactive map and define the geofence radius (e.g., 100 meters)."
                    expanded={expandedFaq === 1}
                    onToggle={() => setExpandedFaq(expandedFaq === 1 ? null : 1)}
                  />
                  <FaqItem
                    question="How can I export CHED-compliant summary reports?"
                    answer="Go to the 'Reports' section, filter by section or date range, and click 'Export Official DTR Summary' to download formatted PDFs or Excel spreadsheets."
                    expanded={expandedFaq === 2}
                    onToggle={() => setExpandedFaq(expandedFaq === 2 ? null : 2)}
                  />
                </>
              )}

              {activeFaqTab === 'supervisor' && (
                <>
                  <FaqItem
                    question="How do I verify student intern attendance?"
                    answer="Log in to the Web Portal or Mobile App using your supervisor account. View the real-time list of trainees clocked in at your workplace along with timestamps and selfie verification."
                    expanded={expandedFaq === 0}
                    onToggle={() => setExpandedFaq(expandedFaq === 0 ? null : 0)}
                  />
                  <FaqItem
                    question="When do I conduct intern performance evaluations?"
                    answer="Evaluation forms automatically appear in your dashboard when a student reaches 50% and 100% of required duty hours. Rate each competency rubric and submit."
                    expanded={expandedFaq === 1}
                    onToggle={() => setExpandedFaq(expandedFaq === 1 ? null : 1)}
                  />
                </>
              )}

              {activeFaqTab === 'technical' && (
                <>
                  <FaqItem
                    question="Where can I download the Windows Desktop App?"
                    answer="Click 'Windows Desktop Client (.exe)' in the footer or the login screen. Run the installer to enjoy native features like system tray parking and the floating stopwatch (Ctrl+M)."
                    expanded={expandedFaq === 0}
                    onToggle={() => setExpandedFaq(expandedFaq === 0 ? null : 0)}
                  />
                  <FaqItem
                    question="What should I do if I forget my password?"
                    answer="Click 'Forgot your password?' on the Sign-In screen. Enter your registered institutional email to receive a password reset link."
                    expanded={expandedFaq === 1}
                    onToggle={() => setExpandedFaq(expandedFaq === 1 ? null : 1)}
                  />
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Need support? Contact ojt-support@cdm.edu.ph</span>
              <button
                onClick={closeModal}
                className="px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 💻 MODAL 4: MEET THE DEVELOPERS (CAPSTONE RESEARCH GROUP) */}
      {/* ========================================================================= */}
      {activeModal === 'developers' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Capstone Engineering & Research Group</h3>
                <p className="text-[11px] text-slate-500">
                  Institute of Computing Studies (ICS) &bull; Colegio de Montalban
                </p>
              </div>
              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-md hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {/* Content Body */}
            <div className="overflow-y-auto px-6 py-5 space-y-4">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs leading-relaxed">
                <strong className="text-slate-800">BS in Information Technology (BSIT) — AY 2025–2026</strong>
                <p className="mt-0.5 text-slate-500">
                  Designed and developed as an institutional capstone research system for the automated monitoring, geofence verification, and document management of student trainees at Colegio de Montalban.
                </p>
              </div>

              {/* Developer & Research Team Cards Grid (2x2) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Ralph Roger Vicente */}
                <div className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-1.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Ralph Roger Vicente</h4>
                      <p className="text-[11px] text-slate-600 font-medium">System Architecture &amp; Development</p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">BSIT</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    System architecture, database modeling, backend services, and overall platform integration.
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">System Architect &bull; Backend &bull; Full-Stack</p>
                </div>

                {/* 2. Jay Baui */}
                <div className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-1.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Jay Baui</h4>
                      <p className="text-[11px] text-slate-600 font-medium">Frontend Developer</p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">BSIT</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Frontend user interfaces, client components, and layout styling across web and mobile platforms.
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">Frontend &bull; UI &bull; Mobile &amp; Web</p>
                </div>

                {/* 3. Jomar Suralta */}
                <div className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-1.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Jomar Suralta</h4>
                      <p className="text-[11px] text-slate-600 font-medium">Researcher &amp; Interviewer</p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">BSIT</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Stakeholder interview coordination, qualitative data gathering, survey administration, and field research.
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">Researcher &bull; Interviewer &bull; Field Data</p>
                </div>

                {/* 4. Jovelyn Golis */}
                <div className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors space-y-1.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Jovelyn Golis</h4>
                      <p className="text-[11px] text-slate-600 font-medium">Researcher &amp; Paper Documentation</p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">BSIT</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Thesis manuscript writing, chapter preparation, research methodology, and paper documentation.
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">Researcher &bull; Documentation &bull; Manuscript</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Colegio de Montalban • Institute of Computing Studies</span>
              <button
                onClick={closeModal}
                className="px-3.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FaqItem({
  question,
  answer,
  expanded,
  onToggle,
}: {
  question: string;
  answer: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 hover:text-slate-950 transition-colors cursor-pointer"
      >
        <span>{question}</span>
        <span className="text-slate-400 font-mono ml-2 text-sm">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="px-3.5 pb-3 pt-1 text-xs text-slate-600 leading-relaxed border-t border-slate-200/60 bg-white">
          {answer}
        </div>
      )}
    </div>
  );
}
