import os
import json
import resend
from datetime import datetime
from uuid import uuid4
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
EMAIL_FROM = os.environ.get('EMAIL_FROM', 'PerformRight <onboarding@resend.dev>')
EMAIL_TEST_MODE_RECIPIENT = os.environ.get('EMAIL_TEST_MODE_RECIPIENT', '')

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

# Brand color palette for email templates
BRAND = {
    'primary': '#1a1a1a',
    'accent': '#0d9488',
    'text': '#1a1a1a',
    'text_secondary': '#6b6b6b',
    'bg': '#ffffff',
    'bg_section': '#f7f7f5',
    'border': '#dcdcd6',
}


def base_email_html(content: str, preheader: str = "") -> str:
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f7f7f5;font-family:'Inter','Helvetica Neue',Arial,sans-serif;">
  <span style="display:none;">{preheader}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <tr><td style="padding:32px 40px 24px 40px;border-bottom:1px solid #ececea;">
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#1a1a1a;">
            <em>Perform</em>Right
          </div>
          <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;">
            by Valiram
          </div>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          {content}
        </td></tr>
        <tr><td style="padding:24px 40px;background:#f7f7f5;border-top:1px solid #ececea;font-size:11px;color:#9a9a9a;text-align:center;">
          This is an automated email from PerformRight. Do not reply to this email.<br>
          © Valiram Group · Performance Management System
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def button(text: str, url: str) -> str:
    return f"""
<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr><td style="background:#1a1a1a;border-radius:6px;">
    <a href="{url}" style="display:inline-block;padding:12px 32px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;">
      {text}
    </a>
  </td></tr>
</table>
"""


async def get_email_settings(db: AsyncSession) -> dict:
    result = await db.execute(text("""
        SELECT key, value FROM system_settings
        WHERE key IN ('email_notifications_enabled', 'email_test_mode')
    """))
    settings = {row[0]: row[1] for row in result.all()}
    return {
        'enabled': settings.get('email_notifications_enabled', 'true') == 'true',
        'test_mode': settings.get('email_test_mode', 'true') == 'true',
    }


async def send_email(
    db: AsyncSession,
    to_email: str,
    subject: str,
    html_content: str,
    template_name: str,
    template_data: dict = None,
    idempotency_key: str = None,
) -> dict:
    """
    Send an email with logging and idempotency.
    Returns: {success: bool, message: str, log_id: str}
    """
    settings = await get_email_settings(db)

    if not settings['enabled']:
        return {'success': False, 'message': 'Email notifications disabled', 'log_id': None}

    if not RESEND_API_KEY:
        return {'success': False, 'message': 'RESEND_API_KEY not configured', 'log_id': None}

    # Check idempotency
    if idempotency_key:
        existing = await db.execute(text("""
            SELECT id, status FROM email_logs
            WHERE idempotency_key = :key
        """), {'key': idempotency_key})
        existing_row = existing.first()
        if existing_row and existing_row[1] == 'SENT':
            return {'success': True, 'message': 'Already sent', 'log_id': str(existing_row[0])}

    # Apply test mode override
    actual_recipient = to_email
    final_subject = subject
    if settings['test_mode'] and EMAIL_TEST_MODE_RECIPIENT:
        final_subject = f"[TO: {to_email}] {subject}"
        actual_recipient = EMAIL_TEST_MODE_RECIPIENT

    # Create log entry
    log_id = str(uuid4())
    await db.execute(text("""
        INSERT INTO email_logs (id, idempotency_key, to_email, subject, template_name, template_data, status, attempt_count, last_attempt_at)
        VALUES (:id, :key, :to_email, :subject, :template_name, :template_data, 'PENDING', 1, NOW())
        ON CONFLICT (idempotency_key) DO UPDATE SET
            attempt_count = email_logs.attempt_count + 1,
            last_attempt_at = NOW()
    """), {
        'id': log_id,
        'key': idempotency_key,
        'to_email': to_email,
        'subject': final_subject,
        'template_name': template_name,
        'template_data': json.dumps(template_data or {}),
    })

    # Send via Resend
    try:
        response = resend.Emails.send({
            'from': EMAIL_FROM,
            'to': actual_recipient,
            'subject': final_subject,
            'html': html_content,
        })

        msg_id = response.get('id', '') if isinstance(response, dict) else getattr(response, 'id', '')
        await db.execute(text("""
            UPDATE email_logs SET
                status = 'SENT',
                sent_at = NOW(),
                provider_message_id = :msg_id
            WHERE id = :id
        """), {'id': log_id, 'msg_id': msg_id})

        return {'success': True, 'message': 'Email sent', 'log_id': log_id}
    except Exception as e:
        error_msg = str(e)[:500]
        await db.execute(text("""
            UPDATE email_logs SET
                status = 'FAILED',
                error_message = :err
            WHERE id = :id
        """), {'id': log_id, 'err': error_msg})
        return {'success': False, 'message': error_msg, 'log_id': log_id}


# Notification templates

async def notify_scorecard_pending_approval(db, manager, employee, cycle):
    content = f"""
<p style="font-size:15px;color:#1a1a1a;margin-bottom:16px;">Hi {manager['full_name'].split()[0]},</p>
<p style="font-size:14px;color:#1a1a1a;line-height:1.6;margin-bottom:16px;">
  <strong>{employee['full_name']}</strong> has submitted their scorecard for approval.
</p>
<table cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:8px;padding:16px;width:100%;margin:16px 0;">
  <tr><td style="padding:12px;">
    <div style="font-size:11px;color:#9a9a9a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Employee</div>
    <div style="font-size:14px;color:#1a1a1a;margin-bottom:12px;">{employee['full_name']} ({employee['employee_id']})</div>
    <div style="font-size:11px;color:#9a9a9a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Cycle</div>
    <div style="font-size:14px;color:#1a1a1a;">{cycle['name']}</div>
  </td></tr>
</table>
{button('Review Scorecard', 'https://tyshushi.github.io/perftrack-pms/tray/approve')}
<p style="font-size:13px;color:#6b6b6b;line-height:1.6;margin-top:24px;">
  Please review and approve at your earliest convenience.
</p>
"""
    html = base_email_html(content, f"{employee['full_name']} submitted their scorecard for approval")
    return await send_email(
        db=db,
        to_email=manager['email'],
        subject=f"Scorecard approval needed: {employee['full_name']}",
        html_content=html,
        template_name='scorecard_pending_approval',
        template_data={'employee_id': str(employee['id']), 'cycle_id': str(cycle['id'])},
        idempotency_key=f"approval_{employee['id']}_{cycle['id']}_{manager['id']}",
    )


async def notify_scorecard_approved(db, employee, cycle, approver):
    content = f"""
<p style="font-size:15px;color:#1a1a1a;margin-bottom:16px;">Hi {employee['full_name'].split()[0]},</p>
<p style="font-size:14px;color:#1a1a1a;line-height:1.6;margin-bottom:16px;">
  Good news — your scorecard for <strong>{cycle['name']}</strong> has been approved by {approver['full_name']}.
</p>
<p style="font-size:14px;color:#1a1a1a;line-height:1.6;margin-bottom:16px;">
  Your KPIs are now locked. You'll receive another email when the self-evaluation window opens.
</p>
{button('View Scorecard', 'https://tyshushi.github.io/perftrack-pms/scorecard/setting')}
"""
    html = base_email_html(content, "Your scorecard has been approved")
    return await send_email(
        db=db,
        to_email=employee['email'],
        subject=f"Scorecard approved: {cycle['name']}",
        html_content=html,
        template_name='scorecard_approved',
        template_data={'cycle_id': str(cycle['id'])},
        idempotency_key=f"approved_{employee['id']}_{cycle['id']}",
    )


async def notify_scorecard_rejected(db, employee, cycle, approver, comment):
    content = f"""
<p style="font-size:15px;color:#1a1a1a;margin-bottom:16px;">Hi {employee['full_name'].split()[0]},</p>
<p style="font-size:14px;color:#1a1a1a;line-height:1.6;margin-bottom:16px;">
  Your scorecard for <strong>{cycle['name']}</strong> has been returned by {approver['full_name']}.
</p>
<table cellpadding="0" cellspacing="0" style="background:#fef9c3;border-radius:8px;padding:16px;width:100%;margin:16px 0;border-left:4px solid #854d0e;">
  <tr><td style="padding:12px;">
    <div style="font-size:11px;color:#854d0e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Reviewer Comment</div>
    <div style="font-size:14px;color:#1a1a1a;line-height:1.5;">{comment or 'Please review and resubmit.'}</div>
  </td></tr>
</table>
{button('Edit Scorecard', 'https://tyshushi.github.io/perftrack-pms/scorecard/setting')}
<p style="font-size:13px;color:#6b6b6b;line-height:1.6;margin-top:24px;">
  Please make the requested changes and resubmit.
</p>
"""
    html = base_email_html(content, "Your scorecard needs revision")
    return await send_email(
        db=db,
        to_email=employee['email'],
        subject=f"Action required: scorecard returned ({cycle['name']})",
        html_content=html,
        template_name='scorecard_rejected',
        template_data={'cycle_id': str(cycle['id']), 'comment': comment},
        idempotency_key=f"rejected_{employee['id']}_{cycle['id']}_{uuid4()}",  # always allow resubmissions
    )


async def notify_self_eval_submitted(db, manager, employee, cycle):
    content = f"""
<p style="font-size:15px;color:#1a1a1a;margin-bottom:16px;">Hi {manager['full_name'].split()[0]},</p>
<p style="font-size:14px;color:#1a1a1a;line-height:1.6;margin-bottom:16px;">
  <strong>{employee['full_name']}</strong> has submitted their self-evaluation for <strong>{cycle['name']}</strong>.
</p>
<p style="font-size:14px;color:#1a1a1a;line-height:1.6;margin-bottom:16px;">
  You can now review and provide your manager evaluation.
</p>
{button('Evaluate Now', 'https://tyshushi.github.io/perftrack-pms/tray/team-eval')}
"""
    html = base_email_html(content, f"{employee['full_name']} submitted their self-evaluation")
    return await send_email(
        db=db,
        to_email=manager['email'],
        subject=f"Self-evaluation submitted: {employee['full_name']}",
        html_content=html,
        template_name='self_eval_submitted',
        template_data={'employee_id': str(employee['id']), 'cycle_id': str(cycle['id'])},
        idempotency_key=f"self_eval_{employee['id']}_{cycle['id']}_{manager['id']}",
    )


async def notify_mgr_eval_complete(db, employee, cycle, manager):
    content = f"""
<p style="font-size:15px;color:#1a1a1a;margin-bottom:16px;">Hi {employee['full_name'].split()[0]},</p>
<p style="font-size:14px;color:#1a1a1a;line-height:1.6;margin-bottom:16px;">
  {manager['full_name']} has completed your performance evaluation for <strong>{cycle['name']}</strong>.
</p>
<p style="font-size:14px;color:#1a1a1a;line-height:1.6;margin-bottom:16px;">
  You can now view your final scorecard and ratings.
</p>
{button('View My Scorecard', 'https://tyshushi.github.io/perftrack-pms/scorecard/setting')}
"""
    html = base_email_html(content, "Your evaluation is complete")
    return await send_email(
        db=db,
        to_email=employee['email'],
        subject=f"Evaluation complete: {cycle['name']}",
        html_content=html,
        template_name='mgr_eval_complete',
        template_data={'cycle_id': str(cycle['id'])},
        idempotency_key=f"mgr_eval_done_{employee['id']}_{cycle['id']}",
    )
