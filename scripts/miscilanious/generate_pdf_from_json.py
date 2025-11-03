from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, Paragraph, PageBreak
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# Try to import bidi for proper Arabic shaping
try:
    from arabic_reshaper import reshape
    HAS_RESHAPER = True
except ImportError:
    HAS_RESHAPER = False
    print("Warning: arabic-reshaper not installed. Install with: pip install arabic-reshaper")
    print("Arabic text may not display correctly without it.\n")

try:
    from bidi.algorithm import get_display
    HAS_BIDI = True
except ImportError:
    HAS_BIDI = False
    print("Warning: python-bidi not installed. Install with: pip install python-bidi")
    print("Arabic text may not display correctly without it.\n")

# Register Arabic font
def register_arabic_font():
    """Register Arabic fonts for proper text rendering with shaping support"""
    try:
        # Download Amiri font if not present (best Arabic support)
        amiri_path = "amiri-regular.ttf"
        if not os.path.exists(amiri_path):
            print("Downloading Amiri font for better Arabic support...")
            import urllib.request
            try:
                urllib.request.urlretrieve(
                    "https://github.com/aliftype/amiri/releases/download/0.113/Amiri-Regular.ttf",
                    amiri_path
                )
                print("✓ Amiri font downloaded")
            except:
                pass
        
        # Try Amiri first (best for Arabic)
        if os.path.exists(amiri_path):
            pdfmetrics.registerFont(TTFont("Arabic", amiri_path))
            return "Arabic"
        
        # Windows fonts
        windows_fonts = [
            "C:\\Windows\\Fonts\\arial.ttf",
            "C:\\Windows\\Fonts\\times.ttf",
        ]
        for font_path in windows_fonts:
            if os.path.exists(font_path):
                pdfmetrics.registerFont(TTFont("Arabic", font_path))
                return "Arabic"
        
        # Linux fonts
        linux_fonts = [
            "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/opentype/noto/NotoSansArabic-Regular.ttf",
        ]
        for font_path in linux_fonts:
            if os.path.exists(font_path):
                pdfmetrics.registerFont(TTFont("Arabic", font_path))
                return "Arabic"
        
        # macOS fonts
        macos_fonts = [
            "/Library/Fonts/Arial.ttf",
            "/System/Library/Fonts/Arial.ttf",
        ]
        for font_path in macos_fonts:
            if os.path.exists(font_path):
                pdfmetrics.registerFont(TTFont("Arabic", font_path))
                return "Arabic"
                
    except Exception as e:
        print(f"Warning: Could not register Arabic font: {e}")
    
    # Fallback to Helvetica
    print("Using Helvetica - Arabic shaping may not work properly")
    return "Helvetica"

# Student data
students_data = [
  {"name": "ندي احمد ابوالنجا", "phone_number": "01002989969", "password": "n7a2b9"},
  {"name": "هلا محمد احمد السعيد", "phone_number": "01003309619", "password": "h4m8s5"},
  {"name": "السعيد الشوربجي", "phone_number": "01004811506", "password": "s3s6j2"},
  {"name": "محمد السعيبد", "phone_number": "01007893647", "password": "m9s4d7"},
  {"name": "منه طارق معوض", "phone_number": "01007940131", "password": "m5t3w8"},
  {"name": "محمد السيد العهداوي", "phone_number": "01008103522", "password": "m2s7a4"},
  {"name": "رمضان حماده", "phone_number": "01008750914", "password": "r6h9d1"},
  {"name": "محمد مجدي", "phone_number": "01009657590", "password": "m8m3j5"},
  {"name": "عبدالله عبدالقادر", "phone_number": "01010428282", "password": "a4a7q9"},
  {"name": "محمود محمد موسي", "phone_number": "01010727715", "password": "m1m5m2"},
  {"name": "حازم سمير السيد", "phone_number": "01010818366", "password": "h3s8s6"},
  {"name": "محمود محمد النزلاوي", "phone_number": "01010857969", "password": "m7m4n3"},
  {"name": "محمود محمد عبدالحي", "phone_number": "01010860458", "password": "m2m9a1"},
  {"name": "ناديه اشرف محمد صابر", "phone_number": "01011406238", "password": "n5a6m4"},
  {"name": "يوسف عمار المحجوب", "phone_number": "01012131943", "password": "y8a3m7"},
  {"name": "زينب السعيد الزهيري", "phone_number": "01013119971", "password": "z4s2z9"},
  {"name": "سندس السيد مرسي", "phone_number": "01013203197", "password": "s6s7m1"},
  {"name": "محمد احمد احمد عطيه", "phone_number": "01013296277", "password": "m3a5a8"},
  {"name": "روضة عبده المتولي", "phone_number": "01013623706", "password": "r9a4m2"},
  {"name": "علي عمرو علي سليمان", "phone_number": "01013989892", "password": "a1a6s5"},
  {"name": "ايه محمد محمد", "phone_number": "01015332907", "password": "a7m2m9"},
  {"name": "اسراء محمود عبدالله", "phone_number": "01015363322", "password": "a4m8a3"},
  {"name": "عمر جمال مختار", "phone_number": "01015408646", "password": "o5j6m1"},
  {"name": "سلمي رضا الغريب", "phone_number": "01015783334", "password": "s2r9g7"},
  {"name": "منار رضا الشوربجي", "phone_number": "01016535025", "password": "m6r3s4"},
  {"name": "مريم محمد ابراهيم", "phone_number": "01017564304", "password": "m8m5i2"},
  {"name": "اسماء ابراهيم", "phone_number": "01019254325", "password": "a1i7m9"},
  {"name": "منه السيد كمال", "phone_number": "01019384738", "password": "m4s3k6"},
  {"name": "ميرنا محمد امين", "phone_number": "01019829107", "password": "m7m9a5"},
  {"name": "علياء احمد الخولي", "phone_number": "01019952461", "password": "a2a4k8"},
  {"name": "محمد السيد الزهيرى", "phone_number": "01020446781", "password": "m5s6z3"},
  {"name": "الاء محمد عاطف", "phone_number": "01020878234", "password": "a9m2a7"},
  {"name": "ندي محمد جمعه", "phone_number": "01021870594", "password": "n3m8j4"},
  {"name": "عمر وليد", "phone_number": "01022105610", "password": "o6w1d9"},
  {"name": "عبدالمجيد ابراهيم رفعت", "phone_number": "01022331436", "password": "a4i5r2"},
  {"name": "حنان ابراهيم محمد", "phone_number": "01022472043", "password": "h7i3m8"},
  {"name": "عبدالرحمن السيد ممدوح", "phone_number": "01022904828", "password": "a1s9m6"},
  {"name": "بدوي أحمد بدوي", "phone_number": "01023541931", "password": "b5a2b4"},
  {"name": "سلمي فتحي يوسف", "phone_number": "01025812148", "password": "s8f7y3"},
  {"name": "عمر احمد ابراهيم", "phone_number": "01026649722", "password": "o2a6i9"},
  {"name": "محمد يوسف", "phone_number": "01026982700", "password": "m4y1f5"},
  {"name": "احمد ايهاب الشيخ", "phone_number": "01028517610", "password": "a7a3s8"},
  {"name": "جني محمد احمد بدران", "phone_number": "01029233276", "password": "j9m5a2"},
  {"name": "اياد السيد القطب", "phone_number": "01029266275", "password": "e6s4q7"},
  {"name": "رودينا شطا محمد", "phone_number": "01030013964", "password": "r1s8m3"},
  {"name": "مهند محمد", "phone_number": "01030275455", "password": "m5m2d9"},
  {"name": "محمد ابراهيم صلاح", "phone_number": "01030465197", "password": "m3i7s4"},
  {"name": "خالد وائل محجوب", "phone_number": "01030478479", "password": "k8w6m1"},
  {"name": "منه الله حسن", "phone_number": "01030795744", "password": "m2a5h9"},
  {"name": "سما رزق سالم", "phone_number": "01031799523", "password": "s7r3s6"},
  {"name": "مي عبدالمجيد", "phone_number": "01033236568", "password": "m4a9j2"},
  {"name": "محمود ابراهيم المسيري", "phone_number": "01033479018", "password": "m1i5m8"},
  {"name": "ملك محمود أحمد العدروسي", "phone_number": "01034119951", "password": "m6m3a7"},
  {"name": "علياء أحمد محمد", "phone_number": "01040765327", "password": "a9a4m1"},
  {"name": "يوسف ايمن محمد المندوه", "phone_number": "01044072944", "password": "y2a8m5"},
  {"name": "شاهنده أحمد الحسيني", "phone_number": "01050186618", "password": "s7a6h3"},
  {"name": "جني أحمد سعد", "phone_number": "01055138524", "password": "j4a2s9"},
  {"name": "محمد رضا محمود", "phone_number": "01055411491", "password": "m8r5m1"},
  {"name": "احمد محمد قاسم", "phone_number": "01055962632", "password": "a3m7q6"},
  {"name": "محمد عبدالفتاح ذكي", "phone_number": "01055967217", "password": "m1a4z9"},
  {"name": "عزت وائل عزت", "phone_number": "01055967412", "password": "e5w2e8"},
  {"name": "جني محمد البغدادي", "phone_number": "01060156701", "password": "j9m6b3"},
  {"name": "نغم رضا محمد", "phone_number": "01060170728", "password": "n2r8m7"},
  {"name": "امل رضا", "phone_number": "01060524559", "password": "a6r3a4"},
  {"name": "سما جمال محمد", "phone_number": "01060546701", "password": "s4j9m1"},
  {"name": "هبه فتحي ابراهيم", "phone_number": "01060554745", "password": "h7f5i2"},
  {"name": "معاذ زغلول", "phone_number": "01060596160", "password": "m3z8l6"},
  {"name": "محمد ابراهيم ياسين", "phone_number": "01061470346", "password": "m1i4y9"},
  {"name": "كريم محمود عبدالسلام", "phone_number": "01063215007", "password": "k5m2a7"},
  {"name": "جني السيد", "phone_number": "01063422849", "password": "j8s6d3"},
  {"name": "مصباح بهاء محمد", "phone_number": "01063682695", "password": "m9b4m1"},
  {"name": "اياد ماجد ماجد محمد", "phone_number": "01063801496", "password": "e2m7m5"},
  {"name": "جني السيد محمد", "phone_number": "01063845723", "password": "j6s3m8"},
  {"name": "يمني الدسوقي", "phone_number": "01064558798", "password": "y4d9q2"},
  {"name": "منار رفعت محمد", "phone_number": "01064595708", "password": "m7r5m1"},
  {"name": "احمد امير المتولي", "phone_number": "010650398870", "password": "a3a8m6"},
  {"name": "يوسف الشوربجي", "phone_number": "01065560339", "password": "y1s4j9"},
  {"name": "روان محمود خطاب", "phone_number": "01065586938", "password": "r5m2k7"},
  {"name": "روميساء احمد", "phone_number": "01065707597", "password": "r8a6s3"},
  {"name": "جومانا السيد عبدالقادر", "phone_number": "01066282252", "password": "j2s9a4"},
  {"name": "زياد يوسف محمد", "phone_number": "01066459237", "password": "z6y3m1"},
  {"name": "حنين السيد محمود", "phone_number": "01066928532", "password": "h9s7m5"},
  {"name": "حنان عزت ماهر", "phone_number": "01067225558", "password": "h4e8m2"},
  {"name": "احمد محمد كمال", "phone_number": "010677609740", "password": "a1m5k9"},
  {"name": "اسماء السعيد عبدالوهاب", "phone_number": "01068523556", "password": "a7s3a6"},
  {"name": "رحمه محمد عبدالمطلب", "phone_number": "01069475218", "password": "r2m8a4"},
  {"name": "الاء سامح محمود", "phone_number": "01070668292", "password": "a5s6m3"},
  {"name": "مريم محمد ابو زيد", "phone_number": "01080260620", "password": "m9m4z1"},
  {"name": "عادل احمد مجاهد", "phone_number": "01080626152", "password": "a3a7m8"},
  {"name": "سلوي علاء الدين", "phone_number": "01080820155", "password": "s6a2d5"},
  {"name": "محمد السيد ابو الغيط", "phone_number": "01080843993", "password": "m1s9g7"},
  {"name": "ابراهيم خالد السيد", "phone_number": "01090028746", "password": "i4k3s2"},
  {"name": "مريم محمود عبدالقادر", "phone_number": "01091552449", "password": "m8m5a9"},
  {"name": "ايه محمد صابر", "phone_number": "01091749732", "password": "a7m2s6"},
  {"name": "هايه حسين علي محمد", "phone_number": "01091832662", "password": "h3h8a1"},
  {"name": "رهف عبدالرحمن الشبراوي", "phone_number": "01092101893", "password": "r5a4s9"},
  {"name": "احمد حماده المسيري", "phone_number": "01092411387", "password": "a2h7m3"},
  {"name": "أحمد ربيع السيد", "phone_number": "01092683754", "password": "a9r6s8"},
  {"name": "حسن السيد حسن", "phone_number": "01093625956", "password": "h4s1h5"},
  {"name": "جني أحمد العمري", "phone_number": "01093974622", "password": "j6a9o2"},
  {"name": "يوسف أحمد محمد المتولي", "phone_number": "01095344688", "password": "y3a5m7"},
  {"name": "ندي محمد محمد", "phone_number": "01095547847", "password": "n8m4m1"},
  {"name": "طارق جمال عبدالناصر", "phone_number": "01095580242", "password": "t1j6a9"},
  {"name": "بسنت أيمن بدوي", "phone_number": "01096051693", "password": "b5a2b4"},
  {"name": "رقية ماجد", "phone_number": "01097029067", "password": "r7m3d8"},
  {"name": "رائد الشوربجي", "phone_number": "01097445096", "password": "r2s9j6"},
  {"name": "مريم حمدينو ابراهيم", "phone_number": "01098455376", "password": "m4h7i1"},
  {"name": "ملك صلاح ابراهيم", "phone_number": "01098947457", "password": "m9s5i3"},
  {"name": "مريم عبدالحميد صالح", "phone_number": "01099234014", "password": "m6a8s2"},
  {"name": "سامي محمد", "phone_number": "01099511303", "password": "s1m4d7"},
  {"name": "يوسف عمر محمود", "phone_number": "01099575157", "password": "y3o9m5"},
  {"name": "هبه هاني سعد الدين", "phone_number": "01102096702", "password": "h8h6s1"},
  {"name": "هنا هاني عبدالحي", "phone_number": "01111504301", "password": "h2h7a4"},
  {"name": "جني أحمد محمود", "phone_number": "01119093966", "password": "j5a3m9"},
  {"name": "نداء علي فتحي", "phone_number": "01122718788", "password": "n9a6f2"},
  {"name": "ابراهيم محمد الخولي", "phone_number": "011449889210", "password": "i4m1k8"},
  {"name": "مريم احمد عبدالغني", "phone_number": "01151147220", "password": "m7a5g3"},
  {"name": "منه ابراهيم", "phone_number": "01155672833", "password": "m2i8m6"},
  {"name": "احمد محمد راشد", "phone_number": "01158284494", "password": "a6m3r1"},
  {"name": "عبدالرحمن ضياء محمد", "phone_number": "0120210440", "password": "a9d5m7"},
  {"name": "فريده ابراهيم محمود", "phone_number": "01224532951", "password": "f3i4m8"},
  {"name": "معاذ رفيق ربيع", "phone_number": "01284437801", "password": "m1r7r2"},
  {"name": "زهره السيد صادق", "phone_number": "01500344066", "password": "z5s9s6"},
  {"name": "فاطمه رشاد رشاد", "phone_number": "01501452133", "password": "f8r4r3"},
  {"name": "بسنت ايمن الشوربجي", "phone_number": "01503303933", "password": "b2a6s1"},
  {"name": "لؤي سامي عبداللطيف", "phone_number": "01505177227", "password": "l4s7a9"},
  {"name": "يوسف صلاح", "phone_number": "01507162009", "password": "y7s3h5"},
  {"name": "امل اشرف ذكي", "phone_number": "01550527058", "password": "a1a8z2"},
  {"name": "جنا محمد سالم", "phone_number": "01551248863", "password": "j9m5s6"},
  {"name": "أمل ابراهيم يوسف", "phone_number": "01551774224", "password": "a3i7y4"},
  {"name": "ميرنا عمرو سامي", "phone_number": "01551857261", "password": "m6o2s8"},
  {"name": "زياد محمد ابراهيم", "phone_number": "01552600580", "password": "z2m9i1"},
  {"name": "حنين حماده رضا", "phone_number": "01553358002", "password": "h5h4r7"},
  {"name": "عمر محمد فوزي", "phone_number": "01553443454", "password": "o8m3f6"},
  {"name": "محمد ابراهيم السيد", "phone_number": "01553810025", "password": "m1i5s9"},
  {"name": "ميار عبدالجيد الحسيني", "phone_number": "01553858400", "password": "m4a7h2"},
  {"name": "احمد محمود حامد", "phone_number": "01554101045", "password": "a9m2h8"},
  {"name": "محمد مصطفي شعيشع", "phone_number": "01556176545", "password": "m3m6s5"},
  {"name": "اياد احمد", "phone_number": "01556176563", "password": "e7a4d1"},
  {"name": "خالد محمود محمود علي", "phone_number": "01556347656", "password": "k2m8m9"},
  {"name": "احمد نادر", "phone_number": "01556413235", "password": "a5n3r6"},
  {"name": "نور عثمان احمد", "phone_number": "01556585502", "password": "n8o7a4"},
  {"name": "دينا محمد محمود", "phone_number": "01557064876", "password": "d1m5m2"},
  {"name": "اشرف السيد صالح", "phone_number": "01557100687", "password": "a6s9s3"},
  {"name": "اروي الحسيني", "phone_number": "01558171288", "password": "a4h7i8"},
  {"name": "ايمان غريب محمد رضوان", "phone_number": "01558238804", "password": "e2g5m1"},
  {"name": "ياسمين علي فرج", "phone_number": "01559607611", "password": "y9a3f6"},
  {"name": "عزه عمرو", "phone_number": "119", "password": "a7o4z2"},
  {"name": "احمد محمد احمد الشحات", "phone_number": "305", "password": "a3m8a5"},
  {"name": "ملك محمود صبري", "phone_number": "326", "password": "m1m6s9"},
  {"name": "فريد وجيه محمد", "phone_number": "340", "password": "f5w2m7"},
  {"name": "محمد قدري", "phone_number": "341", "password": "m8q4i3"},
  {"name": "مريم اشرف شعبان", "phone_number": "517", "password": "m2a7s6"},
  {"name": "محمود عبدالقادر محمود", "phone_number": "518", "password": "m6a3m1"},
  {"name": "بسنت ايمن بدوي", "phone_number": "533", "password": "b9a5b4"}
]

def reshape_arabic(text):
    """Reshape and properly display Arabic text with correct RTL direction"""
    try:
        # First reshape the text for proper character joining
        if HAS_RESHAPER:
            text = reshape(text)
        
        # Then apply bidi algorithm for correct direction
        if HAS_BIDI:
            text = get_display(text)
        
        return text
    except Exception as e:
        print(f"Error reshaping text: {e}")
        return text

def generate_student_pdf():
    # Register Arabic font
    font_name = register_arabic_font()
    
    # A4 page dimensions
    page_height = A4[1]  # 841.89 points
    top_margin = 0.8*cm
    bottom_margin = 0.8*cm
    usable_height = page_height - top_margin - bottom_margin
    
    # Create PDF document
    doc = SimpleDocTemplate("Student_Data.pdf", pagesize=A4, topMargin=top_margin, 
                          bottomMargin=bottom_margin, leftMargin=0.8*cm, rightMargin=0.8*cm)
    
    # Define styles with proper Arabic support
    styles = getSampleStyleSheet()
    
    cell_style = ParagraphStyle(
        'CellStyle',
        parent=styles['Normal'],
        fontSize=14,
        fontName=font_name,
        alignment=TA_RIGHT,
        rightIndent=5,
        leftIndent=5,
    )
    
    label_style = ParagraphStyle(
        'LabelStyle',
        parent=styles['Normal'],
        fontSize=14,
        fontName=font_name,
        alignment=TA_RIGHT,
        rightIndent=5,
        leftIndent=5,
    )
    
    # Process students - 5 per page
    students_per_page = 5
    total_students = len(students_data)
    
    # Table height: 3 rows × 0.6cm + padding = ~2cm per table
    table_height = 2.2*cm
    # Total height for 5 tables
    total_tables_height = table_height * students_per_page
    # Available space for spacing
    available_space = usable_height - total_tables_height
    # Space between tables (divide by 4 gaps between 5 tables)
    space_between = available_space / 5
    
    story = []
    
    for page_num in range(0, total_students, students_per_page):
        page_students = students_data[page_num:page_num + students_per_page]
        
        # Add top spacing
        story.append(Spacer(1, space_between * 0.5))
        
        # Create tables for each student on this page
        for student_idx, student in enumerate(page_students):
            # Reshape Arabic text for proper character joining
            name = reshape_arabic(student['name'])
            phone = reshape_arabic(student['phone_number'])
            password = reshape_arabic(student['password'])
            
            # Create table data using Paragraph for proper Arabic rendering - REVERSED COLUMNS
            table_data = [
                [Paragraph(name, cell_style), Paragraph(reshape_arabic("الاسم"), label_style)],
                [Paragraph(phone, cell_style), Paragraph(reshape_arabic("رقم الهاتف"), label_style)],
                [Paragraph(password, cell_style), Paragraph(reshape_arabic("كلمة المرور"), label_style)]
            ]
            
            # Create table with reversed column widths
            table = Table(table_data, colWidths=[13*cm, 3.5*cm])
            
            # Apply table style
            table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), font_name),
                ('FONTSIZE', (0, 0), (-1, -1), 14),
                ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
                ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
                ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.white]),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('ROWHEIGHTS', (0, 0), (-1, -1), 0.6*cm),
            ]))
            
            story.append(table)
            
            # Add spacing between students
            if student_idx < len(page_students) - 1:
                story.append(Spacer(1, space_between))
        
        # Add page break if not the last page
        if page_num + students_per_page < total_students:
            story.append(PageBreak())
    
    # Build PDF
    doc.build(story)
    print("✓ PDF generated successfully: Student_Data.pdf")
    print(f"✓ Total students: {total_students}")
    print(f"✓ Students per page: {students_per_page}")
    print(f"✓ Total pages: {(total_students + students_per_page - 1) // students_per_page}")

# Generate the PDF
if __name__ == "__main__":
    generate_student_pdf()