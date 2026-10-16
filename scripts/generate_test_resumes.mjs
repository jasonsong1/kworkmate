// ==============================================================================
// generate_test_resumes.mjs
// 목적: KWorkMate 채용/스크리닝/온보딩 테스트를 위한 고품질 영문 이력서(PDF) 10종 생성
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { jsPDF } from 'jspdf';

const OUTPUT_DIR = path.resolve('test_resumes');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const RESUMES = [
  {
    fileName: '01_Liam_Smith_Head_Barista.pdf',
    name: 'Liam Smith',
    role: 'Experienced Head Barista',
    phone: '+61 412 345 678',
    email: 'liam.smith.coffee@example.com',
    location: 'Surry Hills, Sydney NSW',
    visa: 'Australian Citizen',
    availability: 'Full-time / Monday to Sunday (Open to early mornings)',
    summary:
      'Passionate and energetic Barista with over 4 years of specialty coffee experience across busy Sydney cafes. Expert in high-volume espresso extraction, dialling in, latte art, grinder calibration, and proactive team leadership. Known for fast and friendly customer service during peak rush hours.',
    experience: [
      {
        title: 'Head Barista & Shift Lead',
        company: 'The Grounds Roastery, Alexandria NSW',
        period: '2023 - Present',
        bullets: [
          'Managed coffee bar operations serving 800+ cups daily with consistent latte art quality.',
          'Calibrated Mazzer grinders and La Marzocco PB espresso machines daily.',
          'Trained and mentored 5 junior baristas on milk texturing and recipe consistency.',
          'Maintained coffee bean and milk inventory, reducing monthly wastage by 12%.'
        ]
      },
      {
        title: 'Senior Barista',
        company: 'Edition Coffee Roasters, Haymarket NSW',
        period: '2021 - 2023',
        bullets: [
          'Prepared espresso, cold drip, batch brews and pour-over coffee to specialty standards.',
          'Operated POS (Square) and delivered friendly table service during busy brunch hours.',
          'Ensured rigorous cleaning and backflushing of equipment according to food safety.'
        ]
      }
    ],
    skills: ['Specialty Coffee', 'Latte Art', 'La Marzocco / Sanremo', 'Dial-in & Calibration', 'Inventory Management', 'POS Systems', 'Customer Service'],
    certificates: ['Specialty Coffee Association (SCA) Intermediate', 'NSW RSA Certificate', 'Food Safety Handler (SITXFSA005)']
  },
  {
    fileName: '02_Emma_Johnson_Cafe_All_Rounder.pdf',
    name: 'Emma Johnson',
    role: 'Enthusiastic Cafe All-Rounder & Waitstaff',
    phone: '+61 423 456 789',
    email: 'emma.johnson.work@example.com',
    location: 'Fortitude Valley, Brisbane QLD',
    visa: 'Permanent Resident',
    availability: 'Part-time / 25-30 hours per week (Weekdays & Weekends)',
    summary:
      'Adaptable and quick-learning Cafe All-Rounder with 3 years of hands-on experience in customer service, POS cashiering, food preparation, and floor running. Exceptional multitasking ability in high-pressure cafe settings.',
    experience: [
      {
        title: 'Cafe All-Rounder & Cashier',
        company: 'River City Cafe, Brisbane QLD',
        period: '2022 - Present',
        bullets: [
          'Welcomed guests, took orders using Lightspeed POS, and handled cash and EFTPOS payments.',
          'Served food and hot/cold beverages to tables with accuracy and a warm smile.',
          'Prepared fresh sandwiches, wraps, salads, and toasted pastries in the prep kitchen.',
          'Assisted the barista with steaming milk and pouring drinks during breakfast peaks.'
        ]
      },
      {
        title: 'Food & Beverage Attendant',
        company: 'South Bank Bakery & Deli, Brisbane QLD',
        period: '2021 - 2022',
        bullets: [
          'Handled display case restocks, customer inquiries, and takeaway packaging.',
          'Maintained high dining area hygiene, sanitising tables, and resetting cutlery.'
        ]
      }
    ],
    skills: ['Lightspeed POS / Kounta', 'Food Prep & Plating', 'Table Service', 'Cash Handling', 'Opening & Closing Duties', 'Team Collaboration'],
    certificates: ['Food Safety Certificate', 'QLD Responsible Service of Alcohol (RSA)']
  },
  {
    fileName: '03_Minwoo_Kim_Kitchen_Hand.pdf',
    name: 'Minwoo Kim (David)',
    role: 'Diligent Kitchen Hand & Prep Cook',
    phone: '+61 434 567 890',
    email: 'minwoo.kim.aus@example.com',
    location: 'CBD, Melbourne VIC',
    visa: 'Working Holiday Visa (Subclass 417, Full work rights)',
    availability: 'Full-time / Immediate start, Night & Weekend shifts available',
    summary:
      'Reliable, energetic, and hard-working Kitchen Hand with 2+ years of experience in fast-paced commercial kitchens. Skilled in heavy-duty dishwashing, food prep, knife skills, and maintaining top-tier kitchen sanitation standards.',
    experience: [
      {
        title: 'Kitchen Hand & Prep Assistant',
        company: 'Izakaya Den, Melbourne VIC',
        period: '2023 - Present',
        bullets: [
          'Operated commercial pass-through dishwashers, sanitising crockery, pots, and cooking utensils.',
          'Assisted head chef with daily vegetable chopping, meat portioning, and sauce batch prep.',
          'Cleaned and degreased deep fryers, cooking ranges, and grease traps following strict HACCP rules.',
          'Unloaded weekly food deliveries, rotated stock according to FIFO standards.'
        ]
      },
      {
        title: 'Kitchen Porter',
        company: 'Seoul BBQ House, Carlton VIC',
        period: '2022 - 2023',
        bullets: [
          'Maintained dish pit cleanliness during peak dinner rushes of 200+ covers.',
          'Prepped side dishes (Banchan) and supported the hot line with order plating.'
        ]
      }
    ],
    skills: ['Commercial Dishwashing', 'Knife Skills (Vegetable / Meat)', 'Kitchen Deep Cleaning', 'Stock Rotation (FIFO)', 'HACCP Hygiene', 'High Physical Stamina'],
    certificates: ['VIC Food Handler Certificate', 'First Aid Certificate (HLTAID011)']
  },
  {
    fileName: '04_Chloe_Williams_Floor_Supervisor.pdf',
    name: 'Chloe Williams',
    role: 'Experienced Floor Supervisor & Host',
    phone: '+61 445 678 901',
    email: 'chloe.williams.hospo@example.com',
    location: 'Paddington, Sydney NSW',
    visa: 'Australian Citizen',
    availability: 'Full-time / Flexible across lunch and dinner services',
    summary:
      'Dedicated Hospitality Professional with 5 years of front-of-house excellence in fine dining and upscale casual bistros. Proven record of managing floor sections, resolving customer concerns proactively, and leading junior servers.',
    experience: [
      {
        title: 'Floor Supervisor & Head Host',
        company: 'Bistro Moncur, Woollahra NSW',
        period: '2022 - Present',
        bullets: [
          'Supervised a team of 8 floor staff per shift, conducting pre-service briefings.',
          'Managed guest reservations via SevenRooms, maximising seat turnover and VIP recognition.',
          'Handled customer feedback and escalated queries calmly and professionally.',
          'Assisted with end-of-night cash reconciliation and safe counts.'
        ]
      },
      {
        title: 'Senior Waiter / Server',
        company: 'Barangaroo Dining Group, Sydney NSW',
        period: '2019 - 2022',
        bullets: [
          'Delivered seamless 3-course wine-paired dining experiences to 40+ seated guests.',
          'Upsold specialty cocktails, daily chef specials, and premium wine selections.'
        ]
      }
    ],
    skills: ['SevenRooms / OpenTable', 'Team Leadership', 'Wine Knowledge & Pairing', 'Conflict Resolution', 'Floor Section Management', 'Upselling'],
    certificates: ['NSW RSA Certificate', 'NSW RCG Certificate', 'Diploma of Hospitality Management']
  },
  {
    fileName: '05_Lucas_Brown_Line_Cook.pdf',
    name: 'Lucas Brown',
    role: 'Skilled Line Cook & Grill Chef',
    phone: '+61 456 789 012',
    email: 'lucas.brown.chef@example.com',
    location: 'Broadbeach, Gold Coast QLD',
    visa: 'Australian Citizen',
    availability: 'Full-time / 38-45 hours per week',
    summary:
      'Passionate Line Cook with 4 years of experience running grill, fry, and saute stations in busy commercial restaurants. Strong command of food preparation speed, temperature monitoring, and plate presentation.',
    experience: [
      {
        title: 'Grill & Saute Line Cook',
        company: 'The Star Gold Coast - Garden Kitchen & Bar',
        period: '2022 - Present',
        bullets: [
          'Managed the charcoal grill and pan stations during 300+ cover weekend dinners.',
          'Cooked steaks, burgers, seafood, and ribs to precise customer temperature requests.',
          'Controlled food wastage and maintained food safety logs for all refrigerated stations.',
          'Coordinated seamlessly with the expo chef to maintain under-15-minute ticket times.'
        ]
      },
      {
        title: 'Commis Chef',
        company: 'Surfers Paradise Steakhouse, QLD',
        period: '2020 - 2022',
        bullets: [
          'Prepared daily mis-en-place, sauces, marinades, and hand-cut potato wedges.',
          'Ensured kitchen compliance with local health inspections and food safety audits.'
        ]
      }
    ],
    skills: ['Grill & Fry Operations', 'Meat Temperatures', 'Speed of Service', 'Portion Control', 'Equipment Maintenance', 'Mise en Place'],
    certificates: ['Certificate III in Commercial Cookery', 'Food Safety Supervisor Certificate']
  },
  {
    fileName: '06_Jihoon_Park_Bartender.pdf',
    name: 'Jihoon Park (Jay)',
    role: 'Creative Cocktail Bartender & Mixologist',
    phone: '+61 467 890 123',
    email: 'jihoon.jay.bartender@example.com',
    location: 'Fitzroy, Melbourne VIC',
    visa: 'Student Visa (Subclass 500, 48 hours per fortnight permitted)',
    availability: 'Part-time / Evenings (Thursday to Sunday)',
    summary:
      'Energetic and creative Bartender with 3 years of mixology and bar operations experience in trendy cocktail lounges and rooftop venues. Expert in crafting classic and signature cocktails, speed pour techniques, and inventory auditing.',
    experience: [
      {
        title: 'Cocktail Bartender',
        company: 'The Everleigh Cocktail Bar, Fitzroy VIC',
        period: '2023 - Present',
        bullets: [
          'Crafted classic drinks (Old Fashioned, Negroni, Whiskey Sour) and seasonal bespoke recipes.',
          'Delivered engaging bar-top storytelling and tailored drink recommendations to patrons.',
          'Managed bottle stock rotation, ice carving, and fresh fruit juice batching.',
          'Enforced responsible service of alcohol strictly to prevent intoxication.'
        ]
      },
      {
        title: 'Barback & Junior Bartender',
        company: 'Rooftop at QT, Melbourne VIC',
        period: '2022 - 2023',
        bullets: [
          'Restocked kegs, spirits, glassware, and garnishes during high-volume nightclub shifts.',
          'Processed high-speed payments through POS terminals with zero cash variance.'
        ]
      }
    ],
    skills: ['Mixology & Speed Pour', 'Cocktail Menu Development', 'Wine & Spirit Knowledge', 'Keg Changing & Beer Lines', 'Cash & POS Reconciliation', 'Bar Hygiene'],
    certificates: ['VIC RSA Certificate', 'Barista & Mixology Academy Certificate']
  },
  {
    fileName: '07_Olivia_Taylor_Store_Manager.pdf',
    name: 'Olivia Taylor',
    role: 'Assistant Restaurant & Store Manager',
    phone: '+61 478 901 234',
    email: 'olivia.taylor.mgmt@example.com',
    location: 'Chatswood, Sydney NSW',
    visa: 'Australian Citizen',
    availability: 'Full-time / Any roster including opening, closing and weekends',
    summary:
      'Results-driven Assistant Store Manager with 6+ years of leadership in multi-site hospitality and QSR environments. Proven expertise in roster scheduling, labor cost optimisation, onboarding new staff, and delivering sales growth.',
    experience: [
      {
        title: 'Assistant Store Manager',
        company: 'Sushi Hub Flagship, Chatswood NSW',
        period: '2021 - Present',
        bullets: [
          'Directed daily operations for a team of 18 front-of-house and kitchen employees.',
          'Built weekly staff rosters balancing labour cost target of under 28% of revenue.',
          'Led end-to-end employee onboarding: document checks, TFN/super setups, and training.',
          'Increased store Google Reviews rating from 3.8 to 4.7 stars through service training.'
        ]
      },
      {
        title: 'Shift Supervisor',
        company: 'Guzman y Gomez, Sydney NSW',
        period: '2018 - 2021',
        bullets: [
          'Supervised busy lunch and dinner shifts achieving top speed-of-service metrics.',
          'Conducted daily inventory counts, stock ordering, and safe reconciliations.'
        ]
      }
    ],
    skills: ['Roster Scheduling', 'Labour Cost Control', 'Staff Onboarding & Training', 'Stocktake & Supply Ordering', 'KPI Tracking', 'Food Safety Audits'],
    certificates: ['Bachelor of Business (Hospitality Management)', 'NSW Food Safety Supervisor (FSS)', 'NSW RSA Certificate']
  },
  {
    fileName: '08_Noah_Davis_Delivery_Driver.pdf',
    name: 'Noah Davis',
    role: 'Reliable Delivery Driver & Store Hand',
    phone: '+61 489 012 345',
    email: 'noah.davis.delivery@example.com',
    location: 'Northbridge, Perth WA',
    visa: 'Australian Citizen',
    availability: 'Flexible / Lunch & Dinner delivery shifts, Weekends',
    summary:
      'Punctual and courteous Delivery Driver with a clean Australian driver licence and 3 years of commercial route driving experience. Skilled in GPS routing, contactless drop-offs, temperature-sensitive food transport, and back-of-house stock handling.',
    experience: [
      {
        title: 'Delivery Driver & Store Assistant',
        company: 'Crust Pizza Gourmet, Perth WA',
        period: '2022 - Present',
        bullets: [
          'Delivered 35-50 food orders per shift with a 98% on-time delivery record.',
          'Inspected hot bags and insulated containers to ensure food arrived piping hot.',
          'Assisted store with folding pizza boxes, dishwashing, and sweeping between runs.',
          'Maintained vehicle safety checklist and daily mileage logs accurately.'
        ]
      },
      {
        title: 'Courier Driver',
        company: 'StarTrack Express, Perth WA',
        period: '2021 - 2022',
        bullets: [
          'Navigated busy metropolitan routes safely adhering to WA road rules.',
          'Handled electronic proof-of-delivery (POD) scanning devices.'
        ]
      }
    ],
    skills: ['Clean WA Driver Licence (C Class)', 'GPS & Route Planning', 'Safe Driving History', 'Vehicle Inspection', 'Customer Communication', 'Box Assembly & Prep'],
    certificates: ['Australian Full Driver Licence (Zero demerit points)', 'WA RSA Certificate']
  },
  {
    fileName: '09_Sohee_Lee_Pastry_Baker.pdf',
    name: 'Sohee Lee',
    role: 'Talented Pastry Cook & Bakery Assistant',
    phone: '+61 490 123 456',
    email: 'sohee.lee.baker@example.com',
    location: 'Strathfield, Sydney NSW',
    visa: 'Graduate Visa (Subclass 485, Full work rights for 3 years)',
    availability: 'Full-time / Early morning starts (from 4:00 AM)',
    summary:
      'Detail-oriented Pastry Cook with Certificate IV in Patisserie and 3 years of experience in artisan bakeries. Specialised in sourdough dough shaping, croissant lamination, macaron piping, and decorative cake finishing.',
    experience: [
      {
        title: 'Pastry & Bakery Assistant',
        company: 'Bourke Street Bakery, Sydney NSW',
        period: '2022 - Present',
        bullets: [
          'Prepared dough batches using commercial spiral mixers, following precise hydration ratios.',
          'Operated reversible dough sheeters to laminate croissant and danish pastry dough.',
          'Baked sourdough baguettes, rustic loaves, and fruit tarts in deck ovens.',
          'Organised clean pastry prep stations in full compliance with NSW Food Authority standards.'
        ]
      },
      {
        title: 'Commis Pastry Cook',
        company: 'Lumiere Cake Boutique, Sydney NSW',
        period: '2021 - 2022',
        bullets: [
          'Crafted delicate French entremets, chocolate ganache fillings, and sponge bases.',
          'Assisted head pastry chef in setting up display cases for morning customers.'
        ]
      }
    ],
    skills: ['Lamination & Viennoiserie', 'Deck & Convection Ovens', 'Dough Sheeter Operation', 'Cake Decorating', 'Recipe Scaling', 'Kitchen Cleanliness'],
    certificates: ['Certificate IV in Patisserie (William Angliss Institute)', 'NSW Food Safety Handler']
  },
  {
    fileName: '10_Jack_Wilson_Casual_Server.pdf',
    name: 'Jack Wilson',
    role: 'Energetic Casual Waiter & Food Runner',
    phone: '+61 401 234 567',
    email: 'jack.wilson.casual@example.com',
    location: 'Hawthorn, Melbourne VIC',
    visa: 'Australian Citizen',
    availability: 'Casual / Weekday afternoons & All day Weekends',
    summary:
      'Friendly and highly motivated University Student seeking a casual Waiter / Food Runner position. Experienced in three-plate carry, fast table clearing, POS order entry, and delivering polite and positive dining experiences.',
    experience: [
      {
        title: 'Casual Waitstaff & Runner',
        company: 'Hawthorn Taphouse & Diner, Melbourne VIC',
        period: '2023 - Present',
        bullets: [
          'Ran hot food and cold beverages from pass to tables across a 120-seat indoor/outdoor venue.',
          'Cleared and wiped tables quickly to maintain prompt table turnarounds during lunch peaks.',
          'Handled customer condiment requests, cutlery replacements, and water refills attentively.',
          'Assisted with evening dining room pack-down, sweeping, and restocking side stations.'
        ]
      },
      {
        title: 'Retail Cashier & Customer Assistant',
        company: 'Woolworths Supermarkets, Hawthorn VIC',
        period: '2022 - 2023',
        bullets: [
          'Scanned groceries, handled cash and card payments with high accuracy and a polite attitude.',
          'Assisted elderly and families with packing groceries and locating store items.'
        ]
      }
    ],
    skills: ['3-Plate Carry', 'Food Running', 'Table Clearing & Sanitising', 'Order Taking', 'Polite Communication', 'High Energy & Punctuality'],
    certificates: ['VIC Responsible Service of Alcohol (RSA)', 'Currently studying Bachelor of Communications']
  }
];

function buildResumePdf(data) {
  const doc = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  // Header Banner
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(0, 0, pageWidth, 38, 'F');

  // Accent Line
  doc.setFillColor(79, 70, 229); // Indigo-600
  doc.rect(0, 38, pageWidth, 2.5, 'F');

  // Name
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(data.name, margin, 18);

  // Role
  doc.setTextColor(199, 210, 254); // Indigo-200
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(data.role, margin, 26);

  // Contact Info Line
  doc.setTextColor(226, 232, 240); // Slate-200
  doc.setFontSize(8.5);
  const contactText = `${data.phone}  |  ${data.email}  |  ${data.location}`;
  doc.text(contactText, margin, 33);

  let currentY = 48;

  // Key Info Box (Visa & Availability)
  doc.setFillColor(248, 250, 252); // Slate-50
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, currentY, contentWidth, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Work Rights / Visa: ', margin + 4, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(data.visa, margin + 36, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Availability: ', margin + 4, currentY + 12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(data.availability, margin + 26, currentY + 12);

  currentY += 24;

  // Section Helper
  function renderSectionHeader(title, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(79, 70, 229); // Indigo
    doc.text(title.toUpperCase(), margin, y);

    doc.setDrawColor(224, 231, 255);
    doc.setLineWidth(0.6);
    doc.line(margin, y + 2, margin + contentWidth, y + 2);
    return y + 8;
  }

  // 1. Professional Summary
  currentY = renderSectionHeader('Professional Summary', currentY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const summaryLines = doc.splitTextToSize(data.summary, contentWidth);
  doc.text(summaryLines, margin, currentY);
  currentY += summaryLines.length * 4.5 + 6;

  // 2. Experience
  currentY = renderSectionHeader('Employment History', currentY);
  for (const exp of data.experience) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(exp.title, margin, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(exp.period, margin + contentWidth - doc.getTextWidth(exp.period), currentY);

    currentY += 4.5;
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(71, 85, 105);
    doc.text(exp.company, margin, currentY);
    currentY += 5;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    for (const bullet of exp.bullets) {
      doc.setFillColor(79, 70, 229);
      doc.circle(margin + 2, currentY - 1, 0.8, 'F');
      const bLines = doc.splitTextToSize(bullet, contentWidth - 6);
      doc.text(bLines, margin + 6, currentY);
      currentY += bLines.length * 4.2 + 1;
    }
    currentY += 3;
  }

  // 3. Core Skills & Competencies
  currentY = renderSectionHeader('Key Skills & Competencies', currentY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  const skillsText = data.skills.join('   •   ');
  const skillLines = doc.splitTextToSize(skillsText, contentWidth);
  doc.text(skillLines, margin, currentY);
  currentY += skillLines.length * 4.5 + 5;

  // 4. Certificates & Licences
  currentY = renderSectionHeader('Licences, Certifications & Education', currentY);
  for (const cert of data.certificates) {
    doc.setFillColor(16, 185, 129); // Green check bullet
    doc.rect(margin + 1, currentY - 2.5, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(cert, margin + 6, currentY - 1);
    currentY += 5;
  }

  // Footer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('References and work rights verification available upon request.', margin, pageHeight - 10);
  doc.text('Generated for KWorkMate Applicant & Screening Test', margin + contentWidth - 65, pageHeight - 10);

  const filePath = path.join(OUTPUT_DIR, data.fileName);
  const pdfOutput = doc.output('arraybuffer');
  fs.writeFileSync(filePath, Buffer.from(pdfOutput));
  console.log(`[Created]: ${data.fileName}`);
}

for (const resume of RESUMES) {
  buildResumePdf(resume);
}

console.log(`\nSuccessfully created 10 test resumes in: ${OUTPUT_DIR}`);
