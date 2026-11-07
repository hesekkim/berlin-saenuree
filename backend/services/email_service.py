from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import logging
import aiosmtplib
from core.config import settings


logger = logging.getLogger(__name__)


def _get_current_year() -> str:
    return datetime.now().strftime("%Y")


def _get_email_styles() -> str:
    return """
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            line-height: 1.5;
            color: #333;
            -webkit-text-size-adjust: 100%;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 12px;
            background-color: #f9f9f9;
        }
        .content {
            background-color: white;
            padding: 16px;
            border-radius: 8px;
        }
        .content p {
            margin: 0 0 12px;
        }
        .content p:last-child {
            margin-bottom: 0;
        }
        .code {
            font-size: 22px;
            font-weight: bold;
            text-align: center;
            padding: 12px 16px;
            border-radius: 8px;
            letter-spacing: 3px;
            margin: 12px 0;
            font-family: 'Courier New', monospace;
            color: #3b82f6;
            background-color: #f0f9ff;
        }
        .footer {
            text-align: center;
            padding: 12px 8px;
            color: #666;
            font-size: 12px;
        }
        .footer p {
            margin: 4px 0;
        }
        @media only screen and (max-width: 480px) {
            .container {
                padding: 8px;
            }
            .content {
                padding: 12px;
            }
            .code {
                font-size: 20px;
                padding: 10px 12px;
                letter-spacing: 2px;
            }
            .footer {
                padding: 10px 4px;
            }
        }
    """


def _create_email_html(content_html: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
            {_get_email_styles()}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="content">
                {content_html}
            </div>
            <div class="footer">
                <p>This is an automated email. Please do not reply.</p>
                <p>&copy; {_get_current_year()} {settings.app_name}. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """


async def _send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: str,
) -> bool:
    if not settings.smtp_username or not settings.smtp_password or not settings.smtp_from_email:
        logger.error("SMTP credentials not configured. Email will not be sent.")
        return False

    try:
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
        message["To"] = to_email

        message.attach(MIMEText(text_content, "plain"))
        message.attach(MIMEText(html_content, "html"))

        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=settings.smtp_password,
            start_tls=True,
            timeout=5,
        )

        logger.info("Email sent successfully to %s", to_email)
        return True

    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, str(e))
        return False


async def send_verification_email(to_email: str, verification_code: str) -> bool:
    """Send the OTP email. Returns False when mail is skipped or SMTP fails."""
    if not settings.send_real_email:
        logger.info("send_real_email is False - skipping actual email sending")
        if settings.debug:
            logger.info("Verification code for %s: %s", to_email, verification_code)
        return False

    content_html = f"""
        <p>Hello,</p>
        <p>You requested to log in to the <strong>{settings.app_name}</strong> admin panel.</p>
        <p>Your verification code is:</p>
        <div class="code">{verification_code}</div>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <p>If you didn't request this code, please ignore this email.</p>
    """

    text_content = f"""
    Hello,

    You requested to log in to the {settings.app_name} admin panel.

    Your verification code is: {verification_code}

    This code will expire in 10 minutes.

    If you didn't request this code, please ignore this email.

    ---
    This is an automated email. Please do not reply.
    (c) {_get_current_year()} {settings.app_name}. All rights reserved.
    """

    return await _send_email(
        to_email=to_email,
        subject="Your Admin Login Code",
        html_content=_create_email_html(content_html),
        text_content=text_content,
    )
