#!/usr/bin/env python3
"""
TrishulHub AI Agent Transformation - Master Plan PDF Generator
"""

import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, CondPageBreak, Image
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ━━ Color Palette (auto-generated) ━━
ACCENT       = colors.HexColor('#cc3b53')
TEXT_PRIMARY  = colors.HexColor('#1d1f20')
TEXT_MUTED    = colors.HexColor('#71787c')
BG_SURFACE   = colors.HexColor('#dbe0e3')
BG_PAGE      = colors.HexColor('#edeff0')
TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = BG_SURFACE

# ━━ Font Registration ━━
pdfmetrics.registerFont(TTFont('LiberationSerif', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('LiberationSerif-Bold', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Carlito', '/usr/share/fonts/truetype/english/Carlito-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Carlito-Bold', '/usr/share/fonts/truetype/english/Carlito-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('LiberationSerif', normal='LiberationSerif', bold='LiberationSerif-Bold')
registerFontFamily('Carlito', normal='Carlito', bold='Carlito-Bold')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# ━━ Page Setup ━━
PAGE_W, PAGE_H = A4
LEFT_MARGIN = 0.9 * inch
RIGHT_MARGIN = 0.9 * inch
TOP_MARGIN = 0.8 * inch
BOTTOM_MARGIN = 0.8 * inch
AVAILABLE_WIDTH = PAGE_W - LEFT_MARGIN - RIGHT_MARGIN

# ━━ TocDocTemplate ━━
from reportlab.platypus import SimpleDocTemplate, BaseDocTemplate, PageTemplate, Frame
import hashlib

class TocDocTemplate(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

    def __init__(self, filename, **kwargs):
        BaseDocTemplate.__init__(self, filename, **kwargs)
        page_w, page_h = kwargs.get('pagesize', A4)
        lm = kwargs.get('leftMargin', LEFT_MARGIN)
        rm = kwargs.get('rightMargin', RIGHT_MARGIN)
        tm = kwargs.get('topMargin', TOP_MARGIN)
        bm = kwargs.get('bottomMargin', BOTTOM_MARGIN)
        frame = Frame(lm, bm, page_w - lm - rm, page_h - tm - bm, id='main')
        template = PageTemplate(id='main', frames=[frame])
        self.addPageTemplates([template])

# ━━ Styles ━━
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'CustomTitle', fontName='LiberationSerif', fontSize=26,
    leading=32, alignment=TA_LEFT, textColor=ACCENT,
    spaceBefore=6, spaceAfter=10
)

h1_style = ParagraphStyle(
    'H1', fontName='LiberationSerif', fontSize=20,
    leading=26, alignment=TA_LEFT, textColor=ACCENT,
    spaceBefore=18, spaceAfter=10
)

h2_style = ParagraphStyle(
    'H2', fontName='LiberationSerif', fontSize=15,
    leading=20, alignment=TA_LEFT, textColor=TEXT_PRIMARY,
    spaceBefore=14, spaceAfter=8
)

h3_style = ParagraphStyle(
    'H3', fontName='LiberationSerif', fontSize=12,
    leading=16, alignment=TA_LEFT, textColor=TEXT_PRIMARY,
    spaceBefore=10, spaceAfter=6
)

body_style = ParagraphStyle(
    'BodyText2', fontName='LiberationSerif', fontSize=10.5,
    leading=17, alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY,
    spaceBefore=2, spaceAfter=6
)

bullet_style = ParagraphStyle(
    'BulletStyle', fontName='LiberationSerif', fontSize=10.5,
    leading=17, alignment=TA_LEFT, textColor=TEXT_PRIMARY,
    leftIndent=24, bulletIndent=12, spaceBefore=2, spaceAfter=4
)

sub_bullet_style = ParagraphStyle(
    'SubBulletStyle', fontName='LiberationSerif', fontSize=10,
    leading=16, alignment=TA_LEFT, textColor=TEXT_MUTED,
    leftIndent=48, bulletIndent=36, spaceBefore=1, spaceAfter=3
)

callout_style = ParagraphStyle(
    'CalloutStyle', fontName='LiberationSerif', fontSize=10.5,
    leading=17, alignment=TA_LEFT, textColor=TEXT_PRIMARY,
    leftIndent=18, borderPadding=8, spaceBefore=6, spaceAfter=6,
    backColor=BG_PAGE, borderWidth=0, borderRadius=4
)

header_cell_style = ParagraphStyle(
    'HeaderCell', fontName='LiberationSerif', fontSize=10,
    leading=14, alignment=TA_CENTER, textColor=colors.white
)

cell_style = ParagraphStyle(
    'CellStyle', fontName='LiberationSerif', fontSize=9.5,
    leading=14, alignment=TA_LEFT, textColor=TEXT_PRIMARY
)

cell_center_style = ParagraphStyle(
    'CellCenter', fontName='LiberationSerif', fontSize=9.5,
    leading=14, alignment=TA_CENTER, textColor=TEXT_PRIMARY
)

toc_h1 = ParagraphStyle(
    'TOCHeading1', fontSize=13, leftIndent=20, fontName='LiberationSerif',
    spaceBefore=6, spaceAfter=3, textColor=TEXT_PRIMARY
)
toc_h2 = ParagraphStyle(
    'TOCHeading2', fontSize=11, leftIndent=40, fontName='LiberationSerif',
    spaceBefore=3, spaceAfter=2, textColor=TEXT_MUTED
)

# ━━ Helper Functions ━━
def add_heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/>%s' % (key, text), style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def make_table(data, col_ratios=None):
    if col_ratios:
        col_widths = [r * AVAILABLE_WIDTH for r in col_ratios]
    else:
        col_widths = None
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

def bp(text):
    return Paragraph(text, bullet_style)

def sbp(text):
    return Paragraph(text, sub_bullet_style)

def p(text):
    return Paragraph(text, body_style)

def callout(text):
    return Paragraph(text, callout_style)

# ━━ Build Document ━━
output_path = '/home/z/my-project/download/TrishulHub_AI_Agent_Transformation_Master_Plan.pdf'

doc = TocDocTemplate(
    output_path,
    pagesize=A4,
    leftMargin=LEFT_MARGIN,
    rightMargin=RIGHT_MARGIN,
    topMargin=TOP_MARGIN,
    bottomMargin=BOTTOM_MARGIN,
    title='TrishulHub AI Agent Transformation - Master Plan',
    author='Z.ai',
    creator='Z.ai'
)

story = []

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TABLE OF CONTENTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(Paragraph('<b>TrishulHub AI Agent Transformation</b>', title_style))
story.append(Paragraph('<b>Complete Master Plan</b>', ParagraphStyle(
    'Subtitle', fontName='LiberationSerif', fontSize=16,
    leading=22, alignment=TA_LEFT, textColor=TEXT_MUTED,
    spaceBefore=4, spaceAfter=12
)))
story.append(Spacer(1, 8))

toc = TableOfContents()
toc.levelStyles = [toc_h1, toc_h2]
story.append(toc)
story.append(PageBreak())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 1: EXECUTIVE SUMMARY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('<b>1. Executive Summary</b>', h1_style, level=0))

story.append(p(
    'This master plan outlines a complete transformation of TrishulHub from a traditional web development SaaS company '
    'into an AI-agent-powered organization. The goal is simple but ambitious: every task in the company will be handled '
    'or assisted by AI agents, while your team members monitor, review, and approve the work. This means your company '
    'can serve more clients, deliver faster, and grow without needing to hire more people.'
))

story.append(p(
    'Currently, TrishulHub has 4 team members: Taroon (Founder and CEO), Pruthvi (Co-founder and BOD, focused on '
    'business development), Akshat (developer with basic technical knowledge using WordPress and PHP/HTML), and Kiran '
    '(developer with strong technical skills who built the current app). You serve 6 active clients and aim to acquire '
    '4 new clients every month. Your current tools are a basic PHP/HTML management app at app.trishulhub.in and a Gmail account.'
))

story.append(p(
    'The new system will replace your current app with a powerful AI Agent Dashboard built in Next.js. This dashboard '
    'will be the central hub where your team gives tasks to AI agents, monitors their work, approves or rejects outputs, '
    'and manages clients. Clients will also get their own portal to view project progress, download invoices, and raise '
    'support tickets. The system is designed to work within your budget of approximately $18 per month for API costs, '
    'using a smart mix of paid and free AI models through OpenRouter.'
))

story.append(callout(
    '<b>Key Outcome:</b> TrishulHub will operate like a 20-person company with just 4 people, because AI agents will '
    'handle the heavy lifting in development, client acquisition, finance, HR, and project management.'
))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 2: AI AGENTS YOUR COMPANY NEEDS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('<b>2. AI Agents Your Company Needs</b>', h1_style, level=0))

story.append(p(
    'Based on deep research into your business model, team structure, and growth goals, I have designed 7 specialized '
    'AI agents. Each agent has a specific role, specific tasks it handles, and specific rules for when it needs human '
    'approval. Here is the complete breakdown:'
))

# --- Agent 1 ---
story.append(add_heading('<b>2.1 Dev Agent - The Code Builder</b>', h2_style, level=1))

story.append(p(
    'This is the most important agent for your company. The Dev Agent writes code, builds websites and web apps, fixes '
    'bugs, creates templates, and deploys projects to Hostinger. It can understand project requirements in plain English '
    'and generate complete, working code. When Kiran or Akshat give it a task like "Build a 5-page business website for '
    'a restaurant client with a menu page, gallery, and contact form," it will generate all the HTML, CSS, JavaScript, '
    'and PHP files needed.'
))

story.append(Paragraph('<b>What Dev Agent Does Automatically:</b>', h3_style))
story.append(bp('- Writes complete website code in HTML, CSS, JavaScript, and PHP based on project requirements'))
story.append(bp('- Creates responsive designs that work on mobile, tablet, and desktop'))
story.append(bp('- Generates website templates for common business types (restaurants, portfolios, e-commerce, etc.)'))
story.append(bp('- Fixes bugs when you describe the problem or upload a screenshot'))
story.append(bp('- Writes deployment scripts for Hostinger'))
story.append(bp('- Generates API documentation and code comments'))
story.append(bp('- Creates database schemas and writes SQL queries for MySQL'))

story.append(Paragraph('<b>What Needs Human Review (Kiran/Akshat):</b>', h3_style))
story.append(bp('- Final code review before deploying to production'))
story.append(bp('- Architecture decisions for complex applications'))
story.append(bp('- Security-sensitive code (payment integration, user authentication)'))
story.append(bp('- Client-specific customizations that require creative judgment'))

story.append(Paragraph('<b>AI Model Recommendation:</b>', h3_style))
story.append(p(
    'Use GPT-4o-mini for routine code generation (cheap at approximately $0.15 per million input tokens). For complex '
    'applications or debugging, use DeepSeek R1 (free on OpenRouter) which is excellent at reasoning through code problems. '
    'For client-facing code that must be perfect, use GPT-4o (approximately $2.50 per million tokens) but only when needed.'
))

# --- Agent 2 ---
story.append(add_heading('<b>2.2 Client Hunter Agent - The Sales Machine</b>', h2_style, level=1))

story.append(p(
    'This is the agent that solves your biggest problem: finding new clients. Currently, you rely on friends and word of '
    'mouth, which is unpredictable. The Client Hunter Agent will actively search for businesses that need websites, reach '
    'out to them with personalized messages, and bring qualified leads to Pruthvi for closing. This agent works 24/7 and '
    'never gets tired of prospecting.'
))

story.append(Paragraph('<b>What Client Hunter Agent Does Automatically:</b>', h3_style))
story.append(bp('- Searches Google Maps, business directories, and social media for businesses with poor or no websites'))
story.append(bp('- Scores leads based on how likely they are to need your services (1-100 score)'))
story.append(bp('- Writes personalized cold emails referencing specific details about each prospect'))
story.append(bp('- Sends follow-up emails on a schedule (day 3, day 7, day 14) if no response'))
story.append(bp('- Posts content on Instagram and LinkedIn to attract inbound leads'))
story.append(bp('- Tracks all leads in the CRM with status updates (New, Contacted, Interested, Negotiating, Won, Lost)'))
story.append(bp('- Generates weekly reports on lead generation performance and conversion rates'))

story.append(Paragraph('<b>What Needs Human Review (Pruthvi/Taroon):</b>', h3_style))
story.append(bp('- Every cold email must be approved before sending (to maintain quality and brand voice)'))
story.append(bp('- Meeting scheduling and pricing negotiation'))
story.append(bp('- Final proposal creation and sending'))
story.append(bp('- Deciding which leads to pursue aggressively vs. which to deprioritize'))

story.append(Paragraph('<b>Lead Generation Strategy:</b>', h3_style))
story.append(p(
    'The agent will use Apollo.io free tier (100 email credits per month) to find business leads. It will analyze each '
    'prospect\'s current website to identify weaknesses and opportunities. Personalized outreach emails will be sent via '
    'Resend.com (free: 100 emails per day). Social media content will be generated and scheduled automatically. The '
    'estimated cost for this entire pipeline is $0 per month using free tiers, with the AI model costs covered by your '
    'existing budget.'
))

# --- Agent 3 ---
story.append(add_heading('<b>2.3 Finance Agent - The Money Manager</b>', h2_style, level=1))

story.append(p(
    'The Finance Agent handles all money-related tasks so Taroon and Pruthvi can focus on growing the business instead '
    'of chasing invoices and tracking expenses. It generates invoices, sends payment reminders, tracks expenses, creates '
    'financial reports, and monitors cash flow. This agent ensures you always know exactly how much money is coming in '
    'and going out.'
))

story.append(Paragraph('<b>What Finance Agent Does Automatically:</b>', h3_style))
story.append(bp('- Generates professional invoices when a project milestone is completed'))
story.append(bp('- Sends automatic payment reminders (3 days before due, on due date, 3 days after due)'))
story.append(bp('- Tracks all income and expenses in a categorized ledger'))
story.append(bp('- Creates monthly financial summary reports (revenue, expenses, profit, client-wise breakdown)'))
story.append(bp('- Calculates project profitability (actual vs. estimated hours and costs)'))
story.append(bp('- Tracks recurring costs (Hostinger, domain renewals, API costs)'))
story.append(bp('- Generates GST/tax-ready reports for your accountant'))

story.append(Paragraph('<b>What Needs Human Review (Taroon):</b>', h3_style))
story.append(bp('- Sending any invoice above a threshold amount (you decide the limit)'))
story.append(bp('- Making payments or approving expenses above a set amount'))
story.append(bp('- Final review of financial reports before sharing externally'))
story.append(bp('- Any decision involving pricing changes or discounts'))

# --- Agent 4 ---
story.append(add_heading('<b>2.4 Project Manager Agent - The Task Organizer</b>', h2_style, level=1))

story.append(p(
    'The Project Manager Agent is like having a dedicated project manager who never forgets a deadline, never misses a '
    'follow-up, and always knows the status of every project. It creates tasks from client requests, assigns them to the '
    'right team member or AI agent, tracks progress, sends deadline reminders, and generates status reports. It ensures '
    'nothing falls through the cracks.'
))

story.append(Paragraph('<b>What Project Manager Agent Does Automatically:</b>', h3_style))
story.append(bp('- Creates projects and task breakdowns when a new client is onboarded'))
story.append(bp('- Assigns tasks to Dev Agent for code work and to team members for review'))
story.append(bp('- Sends deadline reminders (1 week, 3 days, 1 day before deadline)'))
story.append(bp('- Tracks time spent on each task and project'))
story.append(bp('- Generates weekly project status reports for all active projects'))
story.append(bp('- Escalates blocked or delayed tasks to Taroon or Pruthvi'))
story.append(bp('- Creates client-facing progress updates'))
story.append(bp('- Converts meeting notes into action items with assigned owners and deadlines'))

story.append(Paragraph('<b>What Needs Human Review (Any Team Member):</b>', h3_style))
story.append(bp('- Task priority decisions when multiple projects compete for resources'))
story.append(bp('- Client communication about delays or scope changes'))
story.append(bp('- Resource allocation decisions'))

# --- Agent 5 ---
story.append(add_heading('<b>2.5 HR Agent - The Team Coordinator</b>', h2_style, level=1))

story.append(p(
    'Even with a small team, HR tasks take time. The HR Agent handles attendance tracking, leave management, onboarding '
    'documents, team communication, and workload monitoring. It watches for signs that the team is overloaded and suggests '
    'when it might be time to consider additional help. As your company grows beyond 4 people, this agent becomes even more '
    'valuable.'
))

story.append(Paragraph('<b>What HR Agent Does Automatically:</b>', h3_style))
story.append(bp('- Tracks daily check-ins and working hours'))
story.append(bp('- Manages leave requests and approvals (forwarded to Taroon for final approval)'))
story.append(bp('- Creates onboarding documents for new team members'))
story.append(bp('- Monitors workload per team member and alerts if someone is overloaded'))
story.append(bp('- Sends daily stand-up summaries to the team'))
story.append(bp('- Maintains a company knowledge base (processes, standards, templates)'))
story.append(bp('- Generates monthly team productivity reports'))

story.append(Paragraph('<b>What Needs Human Review (Taroon):</b>', h3_style))
story.append(bp('- Leave approvals'))
story.append(bp('- Hiring decisions (the agent can suggest but not decide)'))
story.append(bp('- Performance reviews and feedback'))

# --- Agent 6 ---
story.append(add_heading('<b>2.6 Content Agent - The Marketing Writer</b>', h2_style, level=1))

story.append(p(
    'The Content Agent creates all written content for your company: website copy for client projects, blog posts for SEO, '
    'social media posts for Instagram and LinkedIn, email templates, case studies, and portfolio descriptions. It works '
    'closely with the Client Hunter Agent to create outreach materials and with the Dev Agent to write website copy for '
    'client projects.'
))

story.append(Paragraph('<b>What Content Agent Does Automatically:</b>', h3_style))
story.append(bp('- Writes website copy for client projects based on their business type and requirements'))
story.append(bp('- Creates social media posts for Instagram (images via AI image generation + captions)'))
story.append(bp('- Writes blog posts about web development topics for SEO'))
story.append(bp('- Generates case studies from completed projects'))
story.append(bp('- Creates email templates for different scenarios (welcome, follow-up, thank you, etc.)'))
story.append(bp('- Writes project proposals and quotations'))
story.append(bp('- Creates portfolio descriptions for your website'))

story.append(Paragraph('<b>What Needs Human Review (Pruthvi/Akshat):</b>', h3_style))
story.append(bp('- All client-facing content before publishing'))
story.append(bp('- Brand voice consistency'))
story.append(bp('- Technical accuracy of blog posts'))

# --- Agent 7 ---
story.append(add_heading('<b>2.7 Support Agent - The Client Helper</b>', h2_style, level=1))

story.append(p(
    'The Support Agent handles client support tickets, answers common questions, and provides first-level technical '
    'support. It can resolve simple issues automatically (like password resets, common how-to questions) and escalates '
    'complex issues to the right team member. Clients interact with this agent through the client portal.'
))

story.append(Paragraph('<b>What Support Agent Does Automatically:</b>', h3_style))
story.append(bp('- Answers common client questions (hosting details, domain info, how to access their site)'))
story.append(bp('- Creates support tickets from client emails and portal submissions'))
story.append(bp('- Categorizes and prioritizes tickets (urgent, high, medium, low)'))
story.append(bp('- Resolves simple issues automatically (FAQ responses, basic troubleshooting)'))
story.append(bp('- Routes complex issues to the right team member'))
story.append(bp('- Sends client satisfaction surveys after ticket resolution'))
story.append(bp('- Generates weekly support summary reports'))

story.append(Paragraph('<b>What Needs Human Review (Kiran/Akshat):</b>', h3_style))
story.append(bp('- Any technical issue the agent cannot resolve'))
story.append(bp('- Client complaints or dissatisfaction'))
story.append(bp('- Requests for changes to live websites'))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 3: AGENT INTERACTION FLOW
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('<b>3. How Agents Work Together</b>', h1_style, level=0))

story.append(p(
    'The agents do not work in isolation. They communicate with each other through a shared database and event system. '
    'Here is how a typical client journey flows through the system, from first contact to final delivery:'
))

story.append(Paragraph('<b>Step-by-Step Client Journey:</b>', h3_style))
story.append(bp('<b>Step 1 - Lead Discovery:</b> Client Hunter Agent finds a business with an outdated website and creates a lead in the CRM.'))
story.append(bp('<b>Step 2 - Outreach:</b> Client Hunter Agent drafts a personalized email. Pruthvi reviews and approves it. The email is sent.'))
story.append(bp('<b>Step 3 - Qualification:</b> If the prospect responds positively, Client Hunter Agent creates a qualified lead and notifies Pruthvi.'))
story.append(bp('<b>Step 4 - Proposal:</b> Content Agent generates a project proposal. Pruthvi customizes and sends it.'))
story.append(bp('<b>Step 5 - Project Creation:</b> When the client says yes, Project Manager Agent creates the project with tasks and deadlines.'))
story.append(bp('<b>Step 6 - Development:</b> Dev Agent writes the code. Kiran reviews and provides feedback via screenshots. Dev Agent revises.'))
story.append(bp('<b>Step 7 - Content:</b> Content Agent writes website copy. Akshat reviews and approves.'))
story.append(bp('<b>Step 8 - Deployment:</b> Dev Agent deploys to Hostinger. Kiran does final review and approves.'))
story.append(bp('<b>Step 9 - Invoicing:</b> Finance Agent generates the invoice. Taroon reviews and approves. Invoice sent to client.'))
story.append(bp('<b>Step 10 - Support:</b> Support Agent handles ongoing client questions. Complex issues go to Kiran or Akshat.'))

story.append(Spacer(1, 12))

# Agent Role Mapping Table
story.append(Paragraph('<b>Agent-to-Team-Member Responsibility Map:</b>', h3_style))
agent_map_data = [
    [Paragraph('<b>Agent</b>', header_cell_style),
     Paragraph('<b>Primary Monitor</b>', header_cell_style),
     Paragraph('<b>Interaction Mode</b>', header_cell_style),
     Paragraph('<b>Approval Required</b>', header_cell_style)],
    [Paragraph('Dev Agent', cell_style), Paragraph('Kiran', cell_center_style),
     Paragraph('AI writes code, Kiran reviews and approves/rejects', cell_style),
     Paragraph('Yes - all outputs', cell_center_style)],
    [Paragraph('Client Hunter', cell_style), Paragraph('Pruthvi', cell_center_style),
     Paragraph('AI finds leads and drafts emails, Pruthvi approves', cell_style),
     Paragraph('Yes - all outreach', cell_center_style)],
    [Paragraph('Finance Agent', cell_style), Paragraph('Taroon', cell_center_style),
     Paragraph('AI prepares invoices and reports, Taroon approves', cell_style),
     Paragraph('Yes - all payments', cell_center_style)],
    [Paragraph('Project Manager', cell_style), Paragraph('All Team', cell_center_style),
     Paragraph('AI organizes and tracks, team reviews status', cell_style),
     Paragraph('For priority changes', cell_center_style)],
    [Paragraph('HR Agent', cell_style), Paragraph('Taroon', cell_center_style),
     Paragraph('AI tracks and suggests, Taroon decides', cell_style),
     Paragraph('For leave/hiring', cell_center_style)],
    [Paragraph('Content Agent', cell_style), Paragraph('Pruthvi/Akshat', cell_center_style),
     Paragraph('AI writes, team reviews and edits', cell_style),
     Paragraph('Yes - client content', cell_center_style)],
    [Paragraph('Support Agent', cell_style), Paragraph('Kiran/Akshat', cell_center_style),
     Paragraph('AI handles simple issues, team handles complex', cell_style),
     Paragraph('For escalations', cell_center_style)],
]
story.append(Spacer(1, 6))
story.append(make_table(agent_map_data, [0.18, 0.17, 0.40, 0.25]))
story.append(Spacer(1, 12))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 4: DASHBOARD DESIGN
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('<b>4. Dashboard Design - Your Command Center</b>', h1_style, level=0))

story.append(p(
    'The AI Agent Dashboard will be a web application accessible at app.trishulhub.in (replacing your current app). '
    'It will be built using Next.js and hosted on Hostinger. Every team member and client will have their own login. '
    'Here is the complete breakdown of every screen and feature the dashboard must have:'
))

# --- 4.1 Login & Roles ---
story.append(add_heading('<b>4.1 Login and User Roles</b>', h2_style, level=1))

story.append(p(
    'The dashboard will have 4 user roles, each with different permissions. When someone logs in, they see only the '
    'features relevant to their role. This keeps the interface clean and secure.'
))

roles_data = [
    [Paragraph('<b>Role</b>', header_cell_style),
     Paragraph('<b>Who</b>', header_cell_style),
     Paragraph('<b>Access Level</b>', header_cell_style),
     Paragraph('<b>Can Do</b>', header_cell_style)],
    [Paragraph('Super Admin', cell_style), Paragraph('Taroon', cell_center_style),
     Paragraph('Full Access', cell_style),
     Paragraph('Everything + settings, billing, team management, API keys', cell_style)],
    [Paragraph('Admin', cell_style), Paragraph('Pruthvi', cell_center_style),
     Paragraph('Most Access', cell_style),
     Paragraph('CRM, projects, finance view, client communication, approve outreach', cell_style)],
    [Paragraph('Developer', cell_style), Paragraph('Kiran, Akshat', cell_center_style),
     Paragraph('Project Access', cell_style),
     Paragraph('Dev tasks, code review, deploy, support tickets, give feedback to AI', cell_style)],
    [Paragraph('Client', cell_style), Paragraph('Clients', cell_center_style),
     Paragraph('Limited Access', cell_style),
     Paragraph('View project progress, download invoices, raise tickets, see who worked on project', cell_style)],
]
story.append(make_table(roles_data, [0.15, 0.15, 0.18, 0.52]))

# --- 4.2 Main Dashboard ---
story.append(add_heading('<b>4.2 Main Dashboard Home Screen</b>', h2_style, level=1))

story.append(p(
    'When a team member logs in, they see the main dashboard. This is the nerve center of the entire system. It shows '
    'a snapshot of everything happening in the company at a glance, with quick actions for the most common tasks.'
))

story.append(Paragraph('<b>Widgets on the Home Screen:</b>', h3_style))
story.append(bp('<b>Agent Status Panel:</b> Shows all 7 agents with their current status (Running, Idle, Waiting for Approval, Error). Each agent shows a colored dot: green = running, gray = idle, yellow = waiting for approval, red = error.'))
story.append(bp('<b>Pending Approvals Queue:</b> A list of tasks waiting for YOUR approval. Each item shows the agent name, task description, and Approve/Reject/Edit buttons. This is where you review AI outputs before they are finalized.'))
story.append(bp('<b>Active Projects Summary:</b> Cards showing each active project with progress percentage, next deadline, and assigned team members.'))
story.append(bp('<b>Revenue This Month:</b> Total income, pending invoices, and overdue payments at a glance.'))
story.append(bp('<b>New Leads Today:</b> Number of new leads found by Client Hunter Agent today, with a quick view button.'))
story.append(bp('<b>API Usage Tracker:</b> Shows how much of your API budget has been used this month, with a progress bar and remaining dollar amount. Broken down by agent.'))
story.append(bp('<b>Quick Action Buttons:</b> "Create New Project", "Give Task to Agent", "Send Invoice", "View Reports".'))

# --- 4.3 Agent Control Panel ---
story.append(add_heading('<b>4.3 Agent Control Panel</b>', h2_style, level=1))

story.append(p(
    'This is where you interact with each AI agent. You can give tasks, review outputs, provide feedback, and manage '
    'settings. Each agent has its own dedicated page within this panel.'
))

story.append(Paragraph('<b>Features on Each Agent Page:</b>', h3_style))
story.append(bp('<b>Task Input Box:</b> A text area where you type what you want the agent to do in plain English. For the Dev Agent, you might type "Build a landing page for a dental clinic with appointment booking form." For the Content Agent, you might type "Write 3 Instagram captions about our new website design service."'))
story.append(bp('<b>File/Screenshot Upload:</b> A drag-and-drop area to upload files (images, documents, code files) or screenshots. This is essential for giving feedback to agents. For example, if the Dev Agent built a page but the layout is wrong, Akshat can take a screenshot, circle the problem area, upload it, and type "Fix the header alignment as shown in this screenshot."'))
story.append(bp('<b>Output Viewer:</b> Shows the agent\'s latest output. For code, it shows a code preview. For emails, it shows the email text. For invoices, it shows the invoice preview. For websites, it can show a live preview link.'))
story.append(bp('<b>Approve/Reject/Edit Buttons:</b> After reviewing the output, click Approve to finalize, Reject to discard, or Edit to modify before approving.'))
story.append(bp('<b>Conversation History:</b> A chat-like view showing all interactions with this agent, including your instructions, agent responses, feedback, and revisions.'))
story.append(bp('<b>Agent Settings:</b> Configure which AI model this agent uses, set approval requirements, and adjust behavior preferences.'))

# --- 4.4 API Key Management ---
story.append(add_heading('<b>4.4 API Key Management (Critical Feature)</b>', h2_style, level=1))

story.append(p(
    'This is one of the most important features you requested. Since you have a limited budget for AI APIs, you need '
    'to be able to manage multiple API keys, see how much limit is left on each, and switch keys when one runs out. '
    'The API Key Management page gives you complete control.'
))

story.append(Paragraph('<b>How It Works:</b>', h3_style))
story.append(p(
    'You can add multiple API keys from different providers. Each key is assigned to one or more agents. When an agent '
    'needs to call an AI model, the system checks which key to use based on the agent assignment and current usage. If a '
    'key runs out of credits or hits its limit, the system automatically switches to the next available key. If no keys '
    'are available, it alerts you and pauses the agent until you add a new key.'
))

story.append(Paragraph('<b>API Key Dashboard Shows:</b>', h3_style))
story.append(bp('<b>Key List:</b> All added API keys with provider name (OpenRouter, z.ai, etc.), key nickname, status (Active/Exhausted/Error), and assigned agents.'))
story.append(bp('<b>Usage Per Key:</b> How many tokens used this month, estimated cost, and remaining balance. A progress bar shows percentage of budget used.'))
story.append(bp('<b>Usage Per Agent:</b> How much each agent is consuming. This helps you identify if one agent is burning through your budget too fast.'))
story.append(bp('<b>Auto-Failover:</b> If Key A runs out, automatically switch to Key B. You set the priority order.'))
story.append(bp('<b>Budget Alerts:</b> Yellow warning at 50% of monthly budget, orange at 75%, red at 90%. Email notification at each threshold.'))
story.append(bp('<b>Model Downgrade:</b> When budget hits 80%, automatically switch agents to cheaper or free models (like from GPT-4o to GPT-4o-mini to free Llama 3.3 70B on OpenRouter).'))

api_key_data = [
    [Paragraph('<b>Provider</b>', header_cell_style),
     Paragraph('<b>What You Get</b>', header_cell_style),
     Paragraph('<b>Cost</b>', header_cell_style),
     Paragraph('<b>Best For</b>', header_cell_style)],
    [Paragraph('z.ai API', cell_style), Paragraph('$18/month plan - multiple model access', cell_style),
     Paragraph('$18/month', cell_center_style), Paragraph('Primary - all agents', cell_style)],
    [Paragraph('OpenRouter', cell_style), Paragraph('Access to 300+ models including free ones', cell_style),
     Paragraph('Free tier available', cell_center_style), Paragraph('Backup + free models', cell_style)],
    [Paragraph('OpenRouter Free Models', cell_style), Paragraph('DeepSeek R1, Llama 3.3 70B, GLM, Qwen 2.5', cell_style),
     Paragraph('$0', cell_center_style), Paragraph('Routine tasks, overflow', cell_style)],
]
story.append(Spacer(1, 6))
story.append(make_table(api_key_data, [0.20, 0.35, 0.18, 0.27]))
story.append(Spacer(1, 12))

# --- 4.5 CRM ---
story.append(add_heading('<b>4.5 CRM (Client Relationship Manager)</b>', h2_style, level=1))

story.append(p(
    'The CRM replaces the basic client management in your current app. It is powered by the Client Hunter Agent for '
    'lead generation and gives Pruthvi and Taroon full visibility into the sales pipeline.'
))

story.append(Paragraph('<b>CRM Features:</b>', h3_style))
story.append(bp('<b>Lead Pipeline:</b> Kanban board view with columns: New Lead, Contacted, Interested, Proposal Sent, Negotiating, Won, Lost. Drag leads between columns.'))
story.append(bp('<b>Lead Details:</b> Click any lead to see company name, contact person, email, phone, website URL, current website quality score, AI-generated outreach suggestions, and full communication history.'))
story.append(bp('<b>Auto-Lead Import:</b> Client Hunter Agent automatically adds new leads. You can also manually add leads.'))
story.append(bp('<b>Email Integration:</b> Send emails directly from the CRM. All replies are tracked and logged automatically.'))
story.append(bp('<b>Follow-up Reminders:</b> The system reminds you when a follow-up is due. AI suggests what to say based on previous interactions.'))
story.append(bp('<b>Conversion Analytics:</b> See how many leads convert at each stage, average time to close, and which lead sources perform best.'))

# --- 4.6 Project Management ---
story.append(add_heading('<b>4.6 Project Management</b>', h2_style, level=1))

story.append(p(
    'This module manages all client projects from creation to delivery. It replaces the basic project tracking in your '
    'current app with a much more powerful system powered by the Project Manager Agent.'
))

story.append(Paragraph('<b>Project Management Features:</b>', h3_style))
story.append(bp('<b>Project Board:</b> Kanban view with columns: Planning, In Progress, Review, Client Approval, Deployed, Completed.'))
story.append(bp('<b>Task Management:</b> Each project has tasks with assignee (team member or AI agent), deadline, priority, status, and file attachments.'))
story.append(bp('<b>AI Task Assignment:</b> When you create a project, the Project Manager Agent suggests a task breakdown with estimated timelines.'))
story.append(bp('<b>Time Tracking:</b> Automatic time logging when work is done. AI agents log their processing time. Team members log their review time.'))
story.append(bp('<b>File Management:</b> Upload project files, code, designs, and documents. Everything is organized by project.'))
story.append(bp('<b>Client Updates:</b> Automatically send progress updates to clients at configurable intervals (daily, weekly, or on milestone completion).'))

# --- 4.7 Finance Dashboard ---
story.append(add_heading('<b>4.7 Finance Dashboard</b>', h2_style, level=1))

story.append(p(
    'The Finance Dashboard gives Taroon complete visibility into the company\'s financial health. The Finance Agent '
    'handles the number-crunching, and Taroon just reviews and approves.'
))

story.append(Paragraph('<b>Finance Dashboard Features:</b>', h3_style))
story.append(bp('<b>Revenue Overview:</b> This month\'s revenue, pending payments, overdue invoices, and revenue trend chart (last 6 months).'))
story.append(bp('<b>Invoice Manager:</b> Create, send, and track invoices. AI generates invoice from project data. One-click send to client.'))
story.append(bp('<b>Expense Tracker:</b> Log expenses with categories (Hosting, Domains, API Costs, Tools, Other). Receipt upload supported.'))
story.append(bp('<b>Profit and Loss Report:</b> Auto-generated monthly P&L statement.'))
story.append(bp('<b>Client Payment History:</b> See all payments from each client with dates, amounts, and invoice numbers.'))
story.append(bp('<b>Budget Tracker:</b> Compare actual spending vs. budget. Alerts when overspending.'))

# --- 4.8 Client Portal ---
story.append(add_heading('<b>4.8 Client Portal</b>', h2_style, level=1))

story.append(p(
    'Clients get their own login to the system. This is a simplified view that shows only information relevant to them. '
    'It replaces and improves upon the client features in your current app.'
))

story.append(Paragraph('<b>Client Portal Features:</b>', h3_style))
story.append(bp('<b>Project Dashboard:</b> See all their projects with current status, progress percentage, and next milestone.'))
story.append(bp('<b>Team Activity:</b> See who worked on their project last (like your current app), with timestamps and task descriptions.'))
story.append(bp('<b>Invoice Center:</b> View all invoices, download as PDF, see payment status (Paid, Pending, Overdue).'))
story.append(bp('<b>Support Tickets:</b> Raise new tickets, view existing tickets and their status, communicate with support team. This is NEW compared to your current app.'))
story.append(bp('<b>File Downloads:</b> Access project deliverables, source files, and documents.'))
story.append(bp('<b>Feedback:</b> Give feedback on completed work with text and screenshot attachments.'))

# --- 4.9 Data Migration ---
story.append(add_heading('<b>4.9 Data Migration from Current App</b>', h2_style, level=1))

story.append(p(
    'Your current app.trishulhub.in has existing data that needs to be moved to the new system. The migration plan is '
    'as follows:'
))

story.append(bp('<b>Client Data:</b> All client names, emails, phone numbers, and project details will be imported into the new CRM.'))
story.append(bp('<b>Project Data:</b> All active and completed projects will be imported with their status, deadlines, and assigned team members.'))
story.append(bp('<b>Invoice Data:</b> All past invoices will be imported into the Finance Dashboard for historical records.'))
story.append(bp('<b>Login Credentials:</b> All existing client login credentials will be migrated so clients do not need to re-register.'))
story.append(p(
    'You will need to export your current data from the old app (as CSV or SQL dump). During the Cline setup process, '
    'Kiran can help with this. The new system will have an import tool that accepts CSV files for easy data loading.'
))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 5: TECH STACK & COST BREAKDOWN
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('<b>5. Technology Stack and Cost Breakdown</b>', h1_style, level=0))

story.append(add_heading('<b>5.1 Technology Choices</b>', h2_style, level=1))

tech_data = [
    [Paragraph('<b>Component</b>', header_cell_style),
     Paragraph('<b>Technology</b>', header_cell_style),
     Paragraph('<b>Why</b>', header_cell_style)],
    [Paragraph('Frontend + Backend', cell_style), Paragraph('Next.js 16', cell_style),
     Paragraph('Modern framework, handles both UI and API, best for AI integration', cell_style)],
    [Paragraph('Database', cell_style), Paragraph('MySQL', cell_style),
     Paragraph('Free on Hostinger, well-supported, reliable for business data', cell_style)],
    [Paragraph('ORM', cell_style), Paragraph('Prisma', cell_style),
     Paragraph('Makes database operations easy and safe, auto-generates queries', cell_style)],
    [Paragraph('UI Components', cell_style), Paragraph('shadcn/ui + Tailwind CSS', cell_style),
     Paragraph('Professional-looking interface, fast to build, fully customizable', cell_style)],
    [Paragraph('AI Gateway', cell_style), Paragraph('OpenRouter', cell_style),
     Paragraph('One API for 300+ models, includes free models, easy key management', cell_style)],
    [Paragraph('Agent Framework', cell_style), Paragraph('Custom (Next.js API)', cell_style),
     Paragraph('Built directly into your app, no external framework needed, full control', cell_style)],
    [Paragraph('Authentication', cell_style), Paragraph('NextAuth.js', cell_style),
     Paragraph('Secure login for team and clients, supports role-based access', cell_style)],
    [Paragraph('Email Service', cell_style), Paragraph('Resend (free tier)', cell_style),
     Paragraph('100 emails per day free, perfect for outreach and notifications', cell_style)],
    [Paragraph('File Storage', cell_style), Paragraph('Hostinger + Local', cell_style),
     Paragraph('Store uploads on your server, no extra cost', cell_style)],
    [Paragraph('Hosting', cell_style), Paragraph('Hostinger Cloud', cell_style),
     Paragraph('Supports Node.js, MySQL included, affordable upgrade', cell_style)],
]
story.append(make_table(tech_data, [0.22, 0.25, 0.53]))

story.append(add_heading('<b>5.2 Monthly Cost Breakdown</b>', h2_style, level=1))

cost_data = [
    [Paragraph('<b>Item</b>', header_cell_style),
     Paragraph('<b>Cost</b>', header_cell_style),
     Paragraph('<b>Notes</b>', header_cell_style)],
    [Paragraph('Hostinger Cloud Hosting', cell_style), Paragraph('$7.99 - $12.99/month', cell_center_style),
     Paragraph('Upgrade from current plan. Includes MySQL, Node.js support, SSL', cell_style)],
    [Paragraph('z.ai API Plan', cell_style), Paragraph('$18/month', cell_center_style),
     Paragraph('Your current plan - primary AI model access', cell_style)],
    [Paragraph('OpenRouter Free Models', cell_style), Paragraph('$0', cell_center_style),
     Paragraph('DeepSeek R1, Llama 3.3 70B, GLM - backup models', cell_style)],
    [Paragraph('Domain (trishulhub.in)', cell_style), Paragraph('Already paid', cell_center_style),
     Paragraph('No additional cost', cell_style)],
    [Paragraph('Email (Resend)', cell_style), Paragraph('$0 (free tier)', cell_center_style),
     Paragraph('100 emails/day - enough for current volume', cell_style)],
    [Paragraph('Lead Finder (Apollo.io)', cell_style), Paragraph('$0 (free tier)', cell_center_style),
     Paragraph('100 email credits/month - good starting point', cell_style)],
    [Paragraph('Total Monthly Cost', cell_style), Paragraph('$26 - $31/month', cell_center_style),
     Paragraph('Well within budget when API costs are optimized', cell_style)],
]
story.append(Spacer(1, 6))
story.append(make_table(cost_data, [0.28, 0.25, 0.47]))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 6: AI MODEL STRATEGY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('<b>6. AI Model Strategy - Getting Maximum Value</b>', h1_style, level=0))

story.append(p(
    'Your biggest concern is the $18/month API budget. The key to making this work is using the right AI model for '
    'each task. Not every task needs the most expensive model. Here is the strategy that will keep your costs low while '
    'maintaining high quality:'
))

story.append(add_heading('<b>6.1 Tiered Model Routing</b>', h2_style, level=1))

model_data = [
    [Paragraph('<b>Task Type</b>', header_cell_style),
     Paragraph('<b>Model</b>', header_cell_style),
     Paragraph('<b>Cost</b>', header_cell_style),
     Paragraph('<b>Used By</b>', header_cell_style)],
    [Paragraph('Simple tasks (formatting, categorization, FAQ answers)', cell_style),
     Paragraph('Llama 3.3 70B (free on OpenRouter)', cell_style),
     Paragraph('$0', cell_center_style),
     Paragraph('Support, HR', cell_style)],
    [Paragraph('Medium tasks (email drafts, content writing, code generation)', cell_style),
     Paragraph('GPT-4o-mini via OpenRouter', cell_style),
     Paragraph('~$0.15/M tokens', cell_center_style),
     Paragraph('Content, Dev, Sales', cell_style)],
    [Paragraph('Complex tasks (reasoning, debugging, analysis)', cell_style),
     Paragraph('DeepSeek R1 (free on OpenRouter)', cell_style),
     Paragraph('$0', cell_center_style),
     Paragraph('Dev, Finance', cell_style)],
    [Paragraph('Critical tasks (client-facing code, important emails)', cell_style),
     Paragraph('GPT-4o or Claude Sonnet', cell_style),
     Paragraph('~$2.50/M tokens', cell_center_style),
     Paragraph('Dev (rare)', cell_style)],
]
story.append(make_table(model_data, [0.30, 0.28, 0.17, 0.25]))

story.append(add_heading('<b>6.2 Cost-Saving Techniques</b>', h2_style, level=1))

story.append(bp('<b>Smart Caching:</b> The system remembers previous AI responses. If someone asks a similar question again, it uses the cached answer instead of calling the API again. This can save 30-80% on repeated queries.'))
story.append(bp('<b>Response Length Limits:</b> Set maximum response lengths for each task type. A 2-sentence email draft does not need a 500-word response. This saves tokens on every call.'))
story.append(bp('<b>Auto-Downgrade:</b> When your monthly budget hits 80%, the system automatically switches all agents to free models (Llama, DeepSeek R1). Quality drops slightly but work continues without interruption.'))
story.append(bp('<b>Batch Processing:</b> Group similar tasks together and process them in one API call instead of multiple calls. For example, generate 5 social media posts in one call instead of 5 separate calls.'))
story.append(bp('<b>Context Summarization:</b> Instead of sending full conversation history every time, summarize previous context. A 1000-token summary replaces a 5000-token history, saving 80% on input tokens.'))

story.append(add_heading('<b>6.3 Estimated Monthly API Usage</b>', h2_style, level=1))

usage_data = [
    [Paragraph('<b>Usage Level</b>', header_cell_style),
     Paragraph('<b>Agent Runs/Day</b>', header_cell_style),
     Paragraph('<b>Model Mix</b>', header_cell_style),
     Paragraph('<b>Est. Monthly Cost</b>', header_cell_style)],
    [Paragraph('Light (starting phase)', cell_style), Paragraph('~50', cell_center_style),
     Paragraph('80% free + 20% paid', cell_style), Paragraph('$3 - $8', cell_center_style)],
    [Paragraph('Medium (growth phase)', cell_style), Paragraph('~200', cell_center_style),
     Paragraph('60% free + 40% paid', cell_style), Paragraph('$8 - $18', cell_center_style)],
    [Paragraph('Heavy (scaling phase)', cell_style), Paragraph('~500+', cell_center_style),
     Paragraph('40% free + 60% paid', cell_style), Paragraph('$18 - $40', cell_center_style)],
]
story.append(Spacer(1, 6))
story.append(make_table(usage_data, [0.25, 0.20, 0.30, 0.25]))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 7: HOSTINGER SETUP GUIDE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('<b>7. Hostinger Setup Guide (Step-by-Step)</b>', h1_style, level=0))

story.append(p(
    'You mentioned you are not from a tech background and currently have a Premium Web Hosting plan on Hostinger that '
    'only supports PHP/HTML. You need to upgrade to a plan that supports Node.js. Here is exactly what to do, explained '
    'in simple terms:'
))

story.append(add_heading('<b>7.1 Step 1: Upgrade Your Hosting Plan</b>', h2_style, level=1))

story.append(bp('<b>Log in to Hostinger:</b> Go to hostinger.com and log in to your account.'))
story.append(bp('<b>Go to Hosting Plans:</b> Click on "Hosting" in the top menu, then click "Upgrade" on your current plan.'))
story.append(bp('<b>Choose Cloud Startup Plan:</b> This costs approximately $7.99/month (promotional price, renews at $25.99/month). It supports Node.js applications, includes unlimited MySQL databases, 3GB RAM, and can handle up to 10 Node.js apps. This is the minimum plan you need.'))
story.append(bp('<b>Complete the Purchase:</b> Pay for the upgrade. Your existing website and data will NOT be affected during the upgrade.'))
story.append(bp('<b>Wait for Activation:</b> The upgrade usually takes 15-30 minutes. You will get an email confirmation.'))

story.append(add_heading('<b>7.2 Step 2: Set Up Node.js Environment</b>', h2_style, level=1))

story.append(bp('<b>Open hPanel:</b> Go to your Hostinger dashboard (hPanel).'))
story.append(bp('<b>Find Node.js Section:</b> Look for "Node.js" or "Advanced" in the left sidebar menu. Click on it.'))
story.append(bp('<b>Create Node.js App:</b> Click "Create Application". Set the App Name to "trishulhub-dashboard". Select Node.js version 20.x (the latest stable version). Set your domain (app.trishulhub.in) as the app URL.'))
story.append(bp('<b>Set Environment Variables:</b> In the app settings, add the following environment variables (these will be provided by Kiran or generated during Cline setup): DATABASE_URL, OPENROUTER_API_KEY, ZAI_API_KEY, NEXTAUTH_SECRET, and NEXTAUTH_URL.'))

story.append(add_heading('<b>7.3 Step 3: Set Up MySQL Database</b>', h2_style, level=1))

story.append(bp('<b>Go to Databases:</b> In hPanel, click "MySQL Databases" in the left sidebar.'))
story.append(bp('<b>Create Database:</b> Click "Create New Database". Name it something like "trishulhub_main". Create a database user with a strong password. Note down the database name, username, and password - you will need these.'))
story.append(bp('<b>Access phpMyAdmin:</b> You can use phpMyAdmin (available in hPanel) to view and manage your database data. This is useful for checking if the migration worked correctly.'))

story.append(add_heading('<b>7.4 Step 4: Connect Your GitHub Repository</b>', h2_style, level=1))

story.append(bp('<b>Create GitHub Account:</b> If you do not have one, create a free account at github.com.'))
story.append(bp('<b>Create Repository:</b> Create a new repository called "trishulhub-dashboard". Make it private so your code is secure.'))
story.append(bp('<b>Connect to Hostinger:</b> In hPanel, under your Node.js app settings, there is a "Deployment" section. Connect your GitHub repository. Set the branch to "main", build command to "npm run build", and start command to "npm run start".'))
story.append(bp('<b>Auto-Deploy:</b> Once connected, every time you push code to GitHub (which Cline will do automatically), Hostinger will rebuild and redeploy your app. This usually takes 2-5 minutes.'))

story.append(add_heading('<b>7.5 Step 5: Point Your Domain</b>', h2_style, level=1))

story.append(p(
    'If app.trishulhub.in was already pointing to your old app, you need to update the DNS or the Node.js app settings '
    'to serve the new dashboard. In most cases, Hostinger handles this automatically when you set the app URL during '
    'Node.js app creation. If the old app was in a subdirectory, Kiran can help redirect the subdomain to the new Node.js app.'
))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 8: STEP-BY-STEP EXECUTION PLAN
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('<b>8. Step-by-Step Execution Plan</b>', h1_style, level=0))

story.append(p(
    'This is the complete execution plan. Each phase has clear steps, who is responsible, and what the expected output '
    'is. Follow this plan sequentially - do not skip steps. The entire build can be done using Cline in VS Code, with '
    'Kiran monitoring and reviewing the generated code.'
))

# Phase 1
story.append(add_heading('<b>8.1 Phase 1: Foundation (Week 1-2)</b>', h2_style, level=1))

story.append(Paragraph('<b>Goal:</b> Set up the hosting environment, create the project structure, and build the basic '
    'dashboard with login and user roles.', callout_style))

story.append(Spacer(1, 6))
phase1_data = [
    [Paragraph('<b>Step</b>', header_cell_style),
     Paragraph('<b>Task</b>', header_cell_style),
     Paragraph('<b>Who</b>', header_cell_style),
     Paragraph('<b>Output</b>', header_cell_style)],
    [Paragraph('1.1', cell_center_style), Paragraph('Upgrade Hostinger plan to Cloud Startup', cell_style),
     Paragraph('Taroon', cell_center_style), Paragraph('Node.js hosting ready', cell_style)],
    [Paragraph('1.2', cell_center_style), Paragraph('Create MySQL database on Hostinger', cell_style),
     Paragraph('Taroon', cell_center_style), Paragraph('Database credentials saved', cell_style)],
    [Paragraph('1.3', cell_center_style), Paragraph('Create GitHub repository "trishulhub-dashboard"', cell_style),
     Paragraph('Kiran', cell_center_style), Paragraph('Private repo created', cell_style)],
    [Paragraph('1.4', cell_center_style), Paragraph('Initialize Next.js project with TypeScript, Tailwind, Prisma', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Project skeleton ready', cell_style)],
    [Paragraph('1.5', cell_center_style), Paragraph('Set up database schema (users, projects, clients, invoices, etc.)', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('All tables created', cell_style)],
    [Paragraph('1.6', cell_center_style), Paragraph('Build authentication (login, register, password reset) with NextAuth.js', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Working login system', cell_style)],
    [Paragraph('1.7', cell_center_style), Paragraph('Create user role system (Super Admin, Admin, Developer, Client)', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Role-based access working', cell_style)],
    [Paragraph('1.8', cell_center_style), Paragraph('Build basic dashboard layout with sidebar navigation', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Dashboard shell ready', cell_style)],
    [Paragraph('1.9', cell_center_style), Paragraph('Deploy to Hostinger and verify it works', cell_style),
     Paragraph('Kiran', cell_center_style), Paragraph('Live app at app.trishulhub.in', cell_style)],
]
story.append(make_table(phase1_data, [0.08, 0.42, 0.18, 0.32]))

# Phase 2
story.append(add_heading('<b>8.2 Phase 2: Core Agent System (Week 3-4)</b>', h2_style, level=1))

story.append(Paragraph('<b>Goal:</b> Build the AI agent infrastructure, API key management, and the Dev Agent as the '
    'first working agent.', callout_style))

story.append(Spacer(1, 6))
phase2_data = [
    [Paragraph('<b>Step</b>', header_cell_style),
     Paragraph('<b>Task</b>', header_cell_style),
     Paragraph('<b>Who</b>', header_cell_style),
     Paragraph('<b>Output</b>', header_cell_style)],
    [Paragraph('2.1', cell_center_style), Paragraph('Build OpenRouter API integration module', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('API calls working', cell_style)],
    [Paragraph('2.2', cell_center_style), Paragraph('Build API Key Management page (add/edit/delete keys, assign to agents)', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('API key dashboard working', cell_style)],
    [Paragraph('2.3', cell_center_style), Paragraph('Build API Usage Tracker (per-key and per-agent usage, budget alerts)', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Usage tracking visible', cell_style)],
    [Paragraph('2.4', cell_center_style), Paragraph('Build Agent Control Panel (task input, output viewer, approve/reject)', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Agent UI ready', cell_style)],
    [Paragraph('2.5', cell_center_style), Paragraph('Build file/screenshot upload feature for agent feedback', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('File upload working', cell_style)],
    [Paragraph('2.6', cell_center_style), Paragraph('Build Dev Agent with code generation capability', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Dev Agent generates code', cell_style)],
    [Paragraph('2.7', cell_center_style), Paragraph('Test Dev Agent: give it a sample project and review output', cell_style),
     Paragraph('Kiran + Akshat', cell_center_style), Paragraph('Dev Agent tested and working', cell_style)],
    [Paragraph('2.8', cell_center_style), Paragraph('Build auto-failover system for API keys', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Key switching works', cell_style)],
]
story.append(make_table(phase2_data, [0.08, 0.42, 0.18, 0.32]))

# Phase 3
story.append(add_heading('<b>8.3 Phase 3: CRM and Client Acquisition (Week 5-6)</b>', h2_style, level=1))

story.append(Paragraph('<b>Goal:</b> Build the CRM module and Client Hunter Agent so you can start finding new clients '
    'automatically.', callout_style))

story.append(Spacer(1, 6))
phase3_data = [
    [Paragraph('<b>Step</b>', header_cell_style),
     Paragraph('<b>Task</b>', header_cell_style),
     Paragraph('<b>Who</b>', header_cell_style),
     Paragraph('<b>Output</b>', header_cell_style)],
    [Paragraph('3.1', cell_center_style), Paragraph('Build CRM with lead pipeline (Kanban board), lead details, and status tracking', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('CRM working', cell_style)],
    [Paragraph('3.2', cell_center_style), Paragraph('Build Client Hunter Agent with lead finding and email drafting', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Agent finds leads', cell_style)],
    [Paragraph('3.3', cell_center_style), Paragraph('Integrate Resend.com for sending emails from the CRM', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Email sending works', cell_style)],
    [Paragraph('3.4', cell_center_style), Paragraph('Build email approval queue for Pruthvi', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Approval workflow ready', cell_style)],
    [Paragraph('3.5', cell_center_style), Paragraph('Build follow-up automation system', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Auto follow-ups work', cell_style)],
    [Paragraph('3.6', cell_center_style), Paragraph('Test Client Hunter: find 10 sample leads and draft outreach emails', cell_style),
     Paragraph('Pruthvi', cell_center_style), Paragraph('Agent tested and working', cell_style)],
]
story.append(make_table(phase3_data, [0.08, 0.42, 0.18, 0.32]))

# Phase 4
story.append(add_heading('<b>8.4 Phase 4: Finance and Project Management (Week 7-8)</b>', h2_style, level=1))

story.append(Paragraph('<b>Goal:</b> Build the Finance Dashboard, Project Management module, and their associated agents.', callout_style))

story.append(Spacer(1, 6))
phase4_data = [
    [Paragraph('<b>Step</b>', header_cell_style),
     Paragraph('<b>Task</b>', header_cell_style),
     Paragraph('<b>Who</b>', header_cell_style),
     Paragraph('<b>Output</b>', header_cell_style)],
    [Paragraph('4.1', cell_center_style), Paragraph('Build invoice generation and management system', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Invoices working', cell_style)],
    [Paragraph('4.2', cell_center_style), Paragraph('Build Finance Agent with invoice auto-generation and payment tracking', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Finance Agent working', cell_style)],
    [Paragraph('4.3', cell_center_style), Paragraph('Build expense tracker and financial reports', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Reports generating', cell_style)],
    [Paragraph('4.4', cell_center_style), Paragraph('Build Project Management module with Kanban board and task tracking', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('PM module working', cell_style)],
    [Paragraph('4.5', cell_center_style), Paragraph('Build Project Manager Agent with task breakdown and deadline tracking', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('PM Agent working', cell_style)],
    [Paragraph('4.6', cell_center_style), Paragraph('Build invoice approval workflow for Taroon', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Approval working', cell_style)],
    [Paragraph('4.7', cell_center_style), Paragraph('Migrate existing data from old app (clients, projects, invoices)', cell_style),
     Paragraph('Kiran + Cline', cell_center_style), Paragraph('Data migrated successfully', cell_style)],
]
story.append(make_table(phase4_data, [0.08, 0.42, 0.18, 0.32]))

# Phase 5
story.append(add_heading('<b>8.5 Phase 5: Client Portal and Remaining Agents (Week 9-10)</b>', h2_style, level=1))

story.append(Paragraph('<b>Goal:</b> Build the client portal, Support Agent, Content Agent, and HR Agent.', callout_style))

story.append(Spacer(1, 6))
phase5_data = [
    [Paragraph('<b>Step</b>', header_cell_style),
     Paragraph('<b>Task</b>', header_cell_style),
     Paragraph('<b>Who</b>', header_cell_style),
     Paragraph('<b>Output</b>', header_cell_style)],
    [Paragraph('5.1', cell_center_style), Paragraph('Build Client Portal (project view, invoice download, support tickets)', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Client portal working', cell_style)],
    [Paragraph('5.2', cell_center_style), Paragraph('Build Support Agent with ticket handling and auto-responses', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Support Agent working', cell_style)],
    [Paragraph('5.3', cell_center_style), Paragraph('Build Content Agent with content generation for social media and websites', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('Content Agent working', cell_style)],
    [Paragraph('5.4', cell_center_style), Paragraph('Build HR Agent with attendance, leave, and workload tracking', cell_style),
     Paragraph('Cline + Kiran', cell_center_style), Paragraph('HR Agent working', cell_style)],
    [Paragraph('5.5', cell_center_style), Paragraph('Migrate client login credentials to new system', cell_style),
     Paragraph('Kiran', cell_center_style), Paragraph('Clients can log in', cell_style)],
    [Paragraph('5.6', cell_center_style), Paragraph('Full system testing with all agents', cell_style),
     Paragraph('All Team', cell_center_style), Paragraph('Everything tested', cell_style)],
]
story.append(make_table(phase5_data, [0.08, 0.42, 0.18, 0.32]))

# Phase 6
story.append(add_heading('<b>8.6 Phase 6: Launch and Optimize (Week 11-12)</b>', h2_style, level=1))

story.append(Paragraph('<b>Goal:</b> Go live with the new system, train the team, and start using AI agents for real work.', callout_style))

story.append(Spacer(1, 6))
phase6_data = [
    [Paragraph('<b>Step</b>', header_cell_style),
     Paragraph('<b>Task</b>', header_cell_style),
     Paragraph('<b>Who</b>', header_cell_style),
     Paragraph('<b>Output</b>', header_cell_style)],
    [Paragraph('6.1', cell_center_style), Paragraph('Switch app.trishulhub.in DNS to new dashboard', cell_style),
     Paragraph('Kiran', cell_center_style), Paragraph('New app is live', cell_style)],
    [Paragraph('6.2', cell_center_style), Paragraph('Team training session: how to use the dashboard and give tasks to agents', cell_style),
     Paragraph('Kiran + Taroon', cell_center_style), Paragraph('Team knows the system', cell_style)],
    [Paragraph('6.3', cell_center_style), Paragraph('Start using Dev Agent for a real client project', cell_style),
     Paragraph('Kiran + Akshat', cell_center_style), Paragraph('First AI-assisted project', cell_style)],
    [Paragraph('6.4', cell_center_style), Paragraph('Activate Client Hunter Agent to start finding leads', cell_style),
     Paragraph('Pruthvi', cell_center_style), Paragraph('Lead generation active', cell_style)],
    [Paragraph('6.5', cell_center_style), Paragraph('Monitor API usage for first 2 weeks and optimize model routing', cell_style),
     Paragraph('Taroon + Kiran', cell_center_style), Paragraph('Costs optimized', cell_style)],
    [Paragraph('6.6', cell_center_style), Paragraph('Gather team feedback and prioritize improvements', cell_style),
     Paragraph('All Team', cell_center_style), Paragraph('Improvement list ready', cell_style)],
]
story.append(make_table(phase6_data, [0.08, 0.42, 0.18, 0.32]))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 9: CLINE PROMPTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('<b>9. Cline Prompts - Building the System</b>', h1_style, level=0))

story.append(p(
    'These are the prompts you will paste into Cline in VS Code to build each phase. Cline will write the code, and '
    'Kiran will review and commit it to GitHub. Hostinger will automatically deploy. Open each prompt block, copy the '
    'entire text, and paste it into Cline. Wait for Cline to finish before moving to the next prompt.'
))

story.append(callout(
    '<b>Important:</b> Before starting, make sure you have: (1) VS Code installed with the Cline extension, (2) Git '
    'installed and logged into your GitHub account, (3) Your Hostinger Cloud plan upgraded and MySQL database created, '
    '(4) Your OpenRouter API key ready (get one free at openrouter.ai).'
))

# Prompt 1
story.append(add_heading('<b>9.1 Prompt for Phase 1 - Foundation</b>', h2_style, level=1))

prompt1_text = (
    'Build a Next.js 16 web application called "TrishulHub AI Dashboard". This is an AI agent management platform for '
    'a web development SaaS company. Here are the complete requirements: '
    'TECH STACK: Next.js 16 with App Router, TypeScript, Tailwind CSS 4, shadcn/ui components, Prisma ORM with MySQL, '
    'NextAuth.js for authentication. '
    'DATABASE SCHEMA: Create these tables - (1) User: id, name, email, password, role (SUPER_ADMIN/ADMIN/DEVELOPER/CLIENT), '
    'avatar, createdAt. (2) ApiKey: id, provider (OPENROUTER/ZAI/OTHER), keyName, keyValue (encrypted), monthlyBudget, '
    'currentSpend, status (ACTIVE/EXHAUSTED/ERROR), priority, assignedAgents (JSON array), createdAt. (3) Agent: id, name, '
    'type (DEV/CLIENT_HUNTER/FINANCE/PROJECT_MANAGER/HR/CONTENT/SUPPORT), description, model, systemPrompt, status, '
    'apiKeyId, createdAt. (4) Client: id, name, email, phone, company, website, status (ACTIVE/INACTIVE), userId, createdAt. '
    '(5) Project: id, name, clientId, status (PLANNING/IN_PROGRESS/REVIEW/APPROVAL/DEPLOYED/COMPLETED), progress, deadline, '
    'createdAt. (6) Task: id, title, description, projectId, assignedTo (userId or agentId), type (HUMAN/AI), status, '
    'priority, deadline, createdAt. (7) Invoice: id, invoiceNumber, clientId, projectId, amount, status (DRAFT/SENT/PAID/OVERDUE), '
    'dueDate, createdAt. (8) Lead: id, name, email, company, website, source, score, status (NEW/CONTACTED/INTERESTED/PROPOSAL/'
    'NEGOTIATING/WON/LOST), notes, createdAt. (9) AgentConversation: id, agentId, userId, messages (JSON), status, createdAt. '
    '(10) ApiUsageLog: id, apiKeyId, agentId, model, inputTokens, outputTokens, cost, createdAt. '
    'AUTHENTICATION: Use NextAuth.js with credentials provider. Create default users on seed: taroon@trishulhub.in (Super Admin), '
    'pruthvi@trishulhub.in (Admin), kiran@trishulhub.in (Developer), akshat@trishulhub.in (Developer). '
    'LAYOUT: Dashboard with left sidebar navigation. Sidebar items depend on role. Super Admin sees: Dashboard, Agents, '
    'CRM, Projects, Finance, Team, API Keys, Settings. Admin sees: Dashboard, CRM, Projects, Finance, Settings. '
    'Developer sees: Dashboard, Projects (assigned), Agent Chat, Settings. Client sees: My Projects, Invoices, Support, '
    'Settings. '
    'DASHBOARD HOME: Show widgets - Agent Status Panel (all 7 agents with colored status dots), Pending Approvals Queue '
    '(list with approve/reject buttons), Active Projects Summary (cards with progress), Revenue This Month, New Leads Today, '
    'API Usage Tracker (progress bar with remaining budget), and Quick Action Buttons. '
    'Make the UI professional with shadcn/ui components. Use a clean, modern design with the TrishulHub branding. '
    'Configure for MySQL database with the DATABASE_URL environment variable. Set NEXTAUTH_URL and NEXTAUTH_SECRET. '
    'Create a .env.example file with all required variables. '
    'After creating the project, push it to GitHub repository "trishulhub-dashboard".'
)

story.append(Paragraph(
    '<b>Prompt (copy everything below the line):</b>', h3_style
))
story.append(Spacer(1, 4))

# Use a simple table to make the prompt stand out
prompt_style = ParagraphStyle(
    'PromptStyle', fontName='LiberationSerif', fontSize=9.5,
    leading=15, alignment=TA_LEFT, textColor=TEXT_PRIMARY,
    leftIndent=12, rightIndent=12, spaceBefore=4, spaceAfter=4,
    backColor=BG_PAGE
)
story.append(Paragraph(prompt1_text, prompt_style))

# Prompt 2
story.append(add_heading('<b>9.2 Prompt for Phase 2 - Core Agent System</b>', h2_style, level=1))

prompt2_text = (
    'Continue building the TrishulHub AI Dashboard. Now add the AI agent system with these features: '
    'OPENROUTER INTEGRATION: Create an API module at /lib/ai/openrouter.ts that handles all AI model calls through '
    'OpenRouter API. It should support: (1) Sending messages to any model available on OpenRouter, (2) Streaming '
    'responses, (3) Tracking token usage per call, (4) Automatic retry with a different model if the primary fails, '
    '(5) Support for vision/multimodal models (for screenshot analysis). Use the endpoint https://openrouter.ai/api/v1/chat/completions. '
    'API KEY MANAGEMENT PAGE: Build at /dashboard/api-keys. Features: (1) Add new API key form (provider, key name, '
    'key value, monthly budget, assigned agents), (2) Key list with status indicators (green=active, red=exhausted), '
    '(3) Usage per key (tokens used, cost, remaining budget with progress bar), (4) Usage per agent breakdown, '
    '(5) Auto-failover: when a key hits its budget limit, automatically switch to next priority key, '
    '(6) Budget alerts: yellow at 50%, orange at 75%, red at 90%, (7) Auto-downgrade: at 80% budget, switch all agents '
    'to free models (meta-llama/llama-3.3-70b-instruct:free on OpenRouter). '
    'AGENT CONTROL PANEL: Build at /dashboard/agents/[agentId]. Features: (1) Task input box - large text area where '
    'user types instructions in plain English, (2) File/screenshot upload - drag-and-drop area supporting images and '
    'files, uploaded files are stored locally and their URLs are passed to the AI model, (3) Output viewer - displays '
    'agent response (formatted text, code blocks with syntax highlighting, or preview), (4) Approve/Reject/Edit buttons '
    'below output, (5) Conversation history - chat-like view of all messages between user and agent, (6) Agent settings '
    'panel - configure model, system prompt, approval requirements. '
    'DEV AGENT: Create the first working agent. System prompt: "You are an expert web developer. You write clean, '
    'responsive HTML, CSS, JavaScript, and PHP code. When given a project requirement, you generate complete, working '
    'code. When given a screenshot with feedback, you analyze the image and fix the issues. Always include comments '
    'in your code." Default model: openai/gpt-4o-mini. When user uploads a screenshot, switch to a vision model '
    '(openai/gpt-4o or meta-llama/llama-3.2-11b-vision-instruct:free). Store all conversations in AgentConversation table. '
    'Log all API calls in ApiUsageLog table. '
    'API USAGE TRACKER WIDGET: Add to dashboard home. Shows: (1) Total budget, (2) Amount spent this month, '
    '(3) Breakdown by agent, (4) Breakdown by model, (5) Daily usage chart for last 30 days, '
    '(6) Projected end-of-month spend based on current trajectory.'
)

story.append(Paragraph('<b>Prompt (copy everything below the line):</b>', h3_style))
story.append(Spacer(1, 4))
story.append(Paragraph(prompt2_text, prompt_style))

# Prompt 3
story.append(add_heading('<b>9.3 Prompt for Phase 3 - CRM and Client Acquisition</b>', h2_style, level=1))

prompt3_text = (
    'Continue building the TrishulHub AI Dashboard. Now add the CRM module and Client Hunter Agent: '
    'CRM MODULE at /dashboard/crm: (1) Kanban board with columns: New Lead, Contacted, Interested, Proposal Sent, '
    'Negotiating, Won, Lost. Drag leads between columns. (2) Lead detail page showing: company name, contact person, '
    'email, phone, website, current website quality score (1-10), outreach suggestions from AI, full communication '
    'history. (3) Add lead manually form. (4) Import leads from CSV. (5) Lead source tracking (Manual, AI Found, '
    'Referral, Social Media). (6) Conversion analytics page: conversion rate at each stage, average time to close, '
    'best performing lead sources, monthly trend chart. '
    'CLIENT HUNTER AGENT: System prompt: "You are an expert sales agent for a web development company called '
    'TrishulHub. Your job is to find businesses that need websites and reach out to them. When given a type of business '
    'or location, you suggest lead criteria. When given a lead, you write personalized cold emails that reference '
    'specific details about their business. Keep emails short, professional, and focused on the value TrishulHub '
    'provides." Features: (1) Lead search: user specifies business type and/or location, agent generates a list of '
    'search strategies and suggested lead criteria, (2) Email drafting: given a lead, agent drafts a personalized '
    'cold email, (3) Follow-up drafting: given a previous email and no response, draft a follow-up, '
    '(4) All emails go to approval queue before sending. '
    'EMAIL INTEGRATION: Integrate Resend.com API for sending emails. Create email templates. All emails are logged '
    'in the CRM under the lead. Track email opens and clicks via webhooks. '
    'APPROVAL QUEUE: Build a dedicated page at /dashboard/approvals. Shows all pending items that need human review. '
    'Each item shows: agent name, task type, preview of the output, and Approve/Reject/Edit buttons. Approved items '
    'are executed (emails sent, invoices delivered, code committed). Rejected items return to the agent with rejection reason. '
    'Edited items allow the user to modify before approving.'
)

story.append(Paragraph('<b>Prompt (copy everything below the line):</b>', h3_style))
story.append(Spacer(1, 4))
story.append(Paragraph(prompt3_text, prompt_style))

# Prompt 4
story.append(add_heading('<b>9.4 Prompt for Phase 4 - Finance and Project Management</b>', h2_style, level=1))

prompt4_text = (
    'Continue building the TrishulHub AI Dashboard. Now add Finance Dashboard and Project Management: '
    'FINANCE DASHBOARD at /dashboard/finance: (1) Revenue overview: this month revenue, pending payments, overdue '
    'invoices, revenue trend chart for last 6 months. (2) Invoice manager: create invoice form (select client, '
    'project, line items, tax, due date), preview invoice as PDF, send invoice to client email, mark as paid. '
    '(3) Expense tracker: log expense form (amount, category, date, receipt upload), expense categories: Hosting, '
    'Domains, API Costs, Tools, Marketing, Other. (4) Profit and Loss report: auto-generated monthly, shows total '
    'income, total expenses, net profit, with charts. (5) Client payment history: view all payments from each client '
    'with dates, amounts, invoice numbers. (6) Budget tracker: compare actual vs budget, alert when overspending. '
    'FINANCE AGENT: System prompt: "You are a financial assistant for TrishulHub. You generate professional invoices, '
    'track payments, create financial reports, and send payment reminders. Always calculate amounts accurately and '
    'format financial data clearly." Features: (1) Auto-generate invoice from project milestone data, '
    '(2) Payment reminder automation (3 days before due, on due date, 3 days after due), '
    '(3) Monthly financial summary report generation. All invoices above a configurable threshold require Taroon approval. '
    'PROJECT MANAGEMENT at /dashboard/projects: (1) Project list with status filters, (2) Project detail page with '
    'Kanban task board, (3) Task creation form with assignee (team member or AI agent), priority, deadline, '
    '(4) Time tracking per task, (5) File attachments per project, (6) Client update notifications. '
    'PROJECT MANAGER AGENT: System prompt: "You are a project manager for TrishulHub. You break down projects into '
    'tasks, set realistic deadlines, track progress, and ensure nothing is missed. When given a project description, '
    'you create a detailed task breakdown with estimated hours and dependencies." Features: (1) Task breakdown from '
    'project description, (2) Deadline reminders (1 week, 3 days, 1 day before), (3) Weekly status report generation, '
    '(4) Escalation alerts for blocked or delayed tasks. '
    'DATA MIGRATION: Create a CSV import tool at /dashboard/settings/import. Accept CSV files for clients, projects, '
    'and invoices. Map CSV columns to database fields. Validate data before import. Show import summary with count '
    'of records imported, skipped, and errors.'
)

story.append(Paragraph('<b>Prompt (copy everything below the line):</b>', h3_style))
story.append(Spacer(1, 4))
story.append(Paragraph(prompt4_text, prompt_style))

# Prompt 5
story.append(add_heading('<b>9.5 Prompt for Phase 5 - Client Portal and Remaining Agents</b>', h2_style, level=1))

prompt5_text = (
    'Continue building the TrishulHub AI Dashboard. Now add Client Portal and remaining agents: '
    'CLIENT PORTAL at /portal (separate layout from admin dashboard): (1) Client dashboard: show their projects '
    'with status, progress percentage, next milestone. (2) Project detail: see who worked last (team member name '
    'and timestamp), task list with statuses, project timeline. (3) Invoice center: list all invoices, download as '
    'PDF, see payment status (Paid/Pending/Overdue). (4) Support tickets: raise new ticket (text + file attachment), '
    'view existing tickets and status, reply to tickets. (5) Feedback: give feedback on completed work with text '
    'and screenshot attachments. (6) Client profile: update contact info and password. '
    'SUPPORT AGENT: System prompt: "You are a customer support agent for TrishulHub. You help clients with their '
    'questions about their websites, hosting, domains, and general issues. You are friendly, patient, and thorough. '
    'If you cannot resolve an issue, you escalate it to a human team member." Features: (1) Auto-respond to common '
    'FAQs (hosting details, domain info, how to access site), (2) Create tickets from client submissions, '
    '(3) Categorize and prioritize tickets (urgent/high/medium/low), (4) Auto-resolve simple issues, '
    '(5) Escalate complex issues to Kiran or Akshat, (6) Client satisfaction survey after ticket resolution. '
    'CONTENT AGENT: System prompt: "You are a content writer for TrishulHub. You write website copy, social media '
    'posts, blog articles, email templates, and case studies. Your writing is professional, engaging, and optimized '
    'for SEO. You adapt your tone based on the platform and audience." Features: (1) Website copy generation for '
    'client projects, (2) Social media post generation (Instagram captions, LinkedIn posts), '
    '(3) Blog post writing for SEO, (4) Case study creation from completed projects, '
    '(5) Project proposal and quotation drafting. All client-facing content requires approval. '
    'HR AGENT: System prompt: "You are an HR coordinator for TrishulHub. You track attendance, manage leave requests, '
    'monitor workload, and help with team coordination. You are organized and proactive about alerting management to '
    'potential issues." Features: (1) Daily check-in tracking, (2) Leave request management (submit to Taroon for '
    'approval), (3) Workload monitoring and overload alerts, (4) Daily stand-up summary, (5) Monthly productivity '
    'report generation. '
    'Also add: Notification system (in-app bell icon + email for important events), dark mode toggle, and mobile '
    'responsive design for all pages.'
)

story.append(Paragraph('<b>Prompt (copy everything below the line):</b>', h3_style))
story.append(Spacer(1, 4))
story.append(Paragraph(prompt5_text, prompt_style))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECTION 10: IMPORTANT NOTES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('<b>10. Important Notes and Tips</b>', h1_style, level=0))

story.append(add_heading('<b>10.1 How to Use Cline Effectively</b>', h2_style, level=1))

story.append(p(
    'Cline is an AI coding assistant that runs inside VS Code. It reads your instructions and writes code automatically. '
    'Here are some tips for getting the best results:'
))

story.append(bp('<b>One prompt at a time:</b> Do not paste all 5 prompts at once. Complete one phase, test it, fix any issues, then move to the next prompt. This ensures each layer is solid before building on top of it.'))
story.append(bp('<b>Be specific about errors:</b> If Cline makes a mistake or something does not work, tell it exactly what went wrong. For example, "The login page shows a blank screen" is better than "It does not work."'))
story.append(bp('<b>Let Kiran review:</b> After each phase, have Kiran review the generated code. He can fix issues, improve structure, and ensure security. Cline is good but not perfect - human review is essential.'))
story.append(bp('<b>Commit frequently:</b> After each successful phase, commit the code to GitHub. This creates a backup. If something goes wrong in the next phase, you can always go back to the last working version.'))
story.append(bp('<b>Use .env file:</b> Never put API keys or passwords directly in the code. Always use environment variables. The .env.example file will show you what variables are needed.'))

story.append(add_heading('<b>10.2 Security Considerations</b>', h2_style, level=1))

story.append(bp('<b>API Keys:</b> Store all API keys encrypted in the database. Never expose them in the frontend code.'))
story.append(bp('<b>Passwords:</b> Use bcrypt hashing for all user passwords. NextAuth.js handles this automatically.'))
story.append(bp('<b>Client Data:</b> Clients can only see their own projects and invoices. Never expose other clients\' data.'))
story.append(bp('<b>Agent Actions:</b> All critical agent actions (sending emails, deploying code, sending invoices) require human approval. The system should never take irreversible action without consent.'))
story.append(bp('<b>HTTPS:</b> Hostinger provides free SSL certificates. Make sure your app is always accessed over HTTPS.'))

story.append(add_heading('<b>10.3 Scaling the System</b>', h2_style, level=1))

story.append(p(
    'As TrishulHub grows from 6 clients to 20, 50, or 100 clients, the system will need to scale. Here is how to '
    'handle growth:'
))

story.append(bp('<b>More API Budget:</b> As client volume increases, your API costs will grow. When you consistently hit the $18/month limit, consider upgrading to a $50 or $100/month API plan. The system\'s auto-downgrade feature will keep things running even on a tight budget.'))
story.append(bp('<b>More Team Members:</b> The HR Agent will suggest when to hire. New team members just get a Developer account in the dashboard and can start working immediately.'))
story.append(bp('<b>More Agents:</b> As you identify new needs, you can create custom agents through the dashboard. Just define a system prompt, select a model, and set approval rules.'))
story.append(bp('<b>Performance:</b> If the app gets slow with many users, upgrade Hostinger to a higher Cloud plan with more RAM and CPU. The application architecture supports horizontal scaling.'))
story.append(bp('<b>Client Self-Service:</b> As you grow, enhance the client portal to allow clients to request changes, view analytics, and manage their subscriptions without needing human intervention.'))

story.append(add_heading('<b>10.4 What If Something Goes Wrong?</b>', h2_style, level=1))

story.append(bp('<b>API key runs out:</b> The auto-failover system switches to the next key. You get an email alert. Just add a new key in the API Key Management page.'))
story.append(bp('<b>Agent gives bad output:</b> Reject it in the approval queue. Add feedback explaining what was wrong. The agent will learn from the feedback in future interactions.'))
story.append(bp('<b>Dashboard goes down:</b> Check Hostinger hPanel for error logs. Usually a restart fixes it. Your data is safe in the MySQL database.'))
story.append(bp('<b>Code generation is poor:</b> Try being more specific in your instructions to the Dev Agent. Include examples, reference existing websites, or upload wireframes/screenshots.'))
story.append(bp('<b>Cline generates broken code:</b> Tell Cline the specific error message. It will fix it. If it keeps failing, Kiran can step in and manually fix the issue.'))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BUILD THE PDF
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
doc.multiBuild(story)
print(f"PDF generated successfully: {output_path}")
