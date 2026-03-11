---
description: Check A2P 10DLC campaign approval status for SMS delivery
---

# Check A2P Campaign Status

Run at the start of each development session to monitor whether the Twilio A2P 10DLC campaign has been approved.

## Steps

// turbo
1. Run the A2P status check script:
```
cd x:\Antigravity\Projects\field-service-mgmt\firebase\functions && node -e "const t=require('twilio')(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN);t.messaging.v1.services('MGbb6835c4cf88305c81544d5cfae188b2').usAppToPerson.list().then(c=>c.forEach(x=>console.log('Campaign:',x.sid,'Status:',x.campaignStatus))).catch(e=>console.error(e.message))"
```

2. If status is `APPROVED`: SMS is ready! Send a test:
```
cd x:\Antigravity\Projects\field-service-mgmt\firebase\functions && node -e "const t=require('twilio')(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN);t.messages.create({body:'DispatchBox: A2P approved! SMS is working. '+new Date().toLocaleString(),messagingServiceSid:'MGbb6835c4cf88305c81544d5cfae188b2',to:'+18082829726'}).then(m=>console.log('Sent:',m.sid,m.status)).catch(e=>console.error(e.message))"
```

3. If status is still `IN_PROGRESS`: Campaign is pending review (1-7 business days). No action needed.

4. If status is `FAILED`: Log in to Twilio console and check rejection reason.

## Context
- Campaign SID: `QE2c6890da8086d771620e9b13fadeba0b`
- Messaging Service SID: `MGbb6835c4cf88305c81544d5cfae188b2`
- Brand SID: `BN637378fbf10d1cf4e56b2de017bd8e87` (Sole Proprietor, APPROVED)
- Phone Number: `+18082044472`
- Error 30034 = blocked by carriers until campaign is approved
