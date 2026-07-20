# Logistic Master

Nowoczesne centrum operacyjne dla małej i średniej firmy transportowej obsługującej trasy w Skandynawii.

## Zakres MVP

- dashboard aktywnych transportów i floty,
- planer tras i przepięć naczep,
- baza kierowców i pojazdów,
- raporty statusowe dla kontrahentów,
- przygotowanie zleceń z wiadomości e-mail przez AI,
- moduł paliwa, spalania i wpływu kosztów na marżę,
- konfiguracja Web Sat oraz skrzynki e-mail,
- logowanie, rejestracja i onboarding użytkownika,
- polityka prywatności i centrum praw RODO.

## Uruchomienie lokalne

Projekt nie wymaga instalowania zależności. W katalogu repozytorium uruchom prosty serwer HTTP:

```powershell
py -3 -m http.server 4173 --bind 127.0.0.1
```

Następnie otwórz:

```text
http://127.0.0.1:4173/
```

## Status

Obecna wersja jest interaktywnym prototypem frontendowym. Dane Web Sat, ceny paliwa, poczta i AI są demonstracyjne. Produkcyjne wdrożenie wymaga backendu, bazy danych, bezpiecznego uwierzytelniania i właściwych integracji API/IMAP.
