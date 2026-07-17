; Personnalisation NSIS de COSINT (v1.3, §5).
;
; À la désinstallation, propose de SUPPRIMER ou CONSERVER les données locales
; (tableaux IndexedDB, profil, paramètres — %APPDATA%\COSINT). Conservation par
; défaut (bouton « Non » présélectionné) : désinstaller puis réinstaller ne doit
; jamais faire perdre les enquêtes par accident.
;
; Cette macro n'est PAS exécutée lors des mises à jour (l'installeur de mise à
; jour ne passe pas par la désinstallation interactive) : les données locales
; survivent à toute mise à jour.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
      "Supprimer également les données locales de COSINT ?$\r$\n$\r$\nCela effacera définitivement les tableaux, le profil et les paramètres enregistrés sur ce poste ($APPDATA\COSINT).$\r$\n$\r$\nChoisissez « Non » pour conserver vos données (recommandé)." \
      /SD IDNO IDYES cosint_delete_data IDNO cosint_keep_data
  cosint_delete_data:
    RMDir /r "$APPDATA\COSINT"
  cosint_keep_data:
  ${endIf}
!macroend
