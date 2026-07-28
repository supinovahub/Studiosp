update public.reason_definitions
set label = 'Corretor indisponível'
where category = 'appointment_cancellation'
  and code = 'broker_unavailable'
  and label ~ '(Ã[£§ª³º¡µ©­´¢¤¶¼½¾¿]|Â[·²]|�)';
