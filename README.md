# Resume Builder

A modern web application for AI-powered resume tailoring and PDF generation. Upload your resume, let AI match it to a job description, and generate a polished PDF tailored to the role.

## Tech Stack
- **Frontend**: React 19 + Vite (development server at http://localhost:5173)
- **Backend**: Python Flask + Groq AI (API server at http://127.0.0.1:5000)
- **PDF Generation**: LaTeX (pdflatex) + WeasyPrint
- **Resume Extraction**: pdfplumber

---

## Prerequisites (Install Before Starting)

Before cloning or running the project, install the following:

### 1. Node.js (v18 or higher)
- Download from [nodejs.org](https://nodejs.org)
- Verify installation: `node --version`

### 2. Python (v3.8 or higher)
- Download from [python.org](https://python.org)
- Verify installation: `python --version`

### 3. LaTeX Distribution (Required for PDF Generation)
- **Windows**: Install [MiKTeX](https://miktex.org/download)
  - During setup, enable "Install missing packages on-the-fly"
- **macOS**: Install [MacTeX](https://www.tug.org/mactex/) or [BasicTeX](https://www.tug.org/mactex/morepackages.html)
- **Linux**: Run `sudo apt update && sudo apt install texlive-full`
- Verify installation: `pdflatex --version`

### 4. Groq API Key (Free)
- Sign up at [groq.com](https://groq.com)
- Get your API key from the dashboard (free tier available)

---

## Installation Steps

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd resume-builder
```

### Step 2: Set Up Backend (Python/Flask)

1. Navigate to the backend folder:
   ```bash
   cd backend
   ```

2. Create a Python virtual environment:
   ```bash
   python -m venv venv
   ```

3. Activate the virtual environment:
   - **Windows**: `venv\Scripts\activate`
   - **macOS/Linux**: `source venv/bin/activate`
   - Your terminal prompt should now show `(venv)`.

4. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. Create a `.env` file in the `backend` folder (required for AI features):
   ```bash
   # Create a new file named .env in the backend folder with:
   GROQ_API_KEY=your_actual_groq_api_key_here
   ```
   - Replace `your_actual_groq_api_key_here` with your real key from [groq.com](https://groq.com)
   - This file is ignored by Git and will not be committed
   - Without this, AI resume tailoring will not work

6. (Optional) Test the backend:
   ```bash
   python app.py
   ```
   - Should output: "Running on http://127.0.0.1:5000"
   - Press Ctrl+C to stop

### Step 3: Set Up Frontend (React/Vite)

1. Navigate back to the root directory (in a new terminal):
   ```bash
   cd ../..
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

3. (Optional) Test the frontend:
   ```bash
   npm run dev
   ```
   - Should output: "Local: http://localhost:5173"
   - Press Ctrl+C to stop

---

## Running the Application

### Start Backend (Terminal 1)
```bash
cd backend
venv\Scripts\activate  # Windows
# OR
source venv/bin/activate  # macOS/Linux

python app.py
```
- Backend runs on `http://127.0.0.1:5000`
- Keep this terminal open while using the app

### Start Frontend (Terminal 2)
```bash
# From root directory
npm run dev
```
- Frontend runs on `http://localhost:5173`
- Keep this terminal open while using the app

### Access the App
1. Both servers must be running simultaneously
2. Open your browser and go to: **http://localhost:5173**
3. Start using the resume builder!

---

## How to Use

1. **Upload a Resume**: Click the upload box and select a PDF resume
2. **Enter Job Description**: Paste the job posting or description
3. **Generate Tailored Resume**: Click the generate button
4. **Wait for Processing**: AI will analyze and tailor your resume
5. **Download PDF**: The tailored PDF will be generated and ready for download
6. **Find Outputs**: Generated PDFs are saved in `backend/outputs/latest_resume.pdf`

---

## Project Structure
```
resume-builder/
├── backend/
│   ├── app.py              # Flask server & API endpoints
│   ├── requirements.txt     # Python dependencies
│   ├── templates/          # LaTeX resume template
│   ├── outputs/            # Generated PDFs
│   ├── .env                # ⭐ CREATE THIS: API keys & config
│   └── venv/               # ⭐ AUTO-CREATED: Python virtual environment
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   └── App.jsx         # Main app component
│   ├── package.json        # Node dependencies
│   └── vite.config.js      # Vite configuration
├── src/                    # Root React source (active frontend)
├── node_modules/           # ⭐ AUTO-CREATED: Node.js dependencies
└── package.json            # Root Node.js config
```

---

## Troubleshooting

### Backend Issues

**Error: "pdflatex not found"**
- LaTeX is not installed or not in PATH
- Windows: Reinstall [MiKTeX](https://miktex.org/download) and restart your terminal
- Verify: Run `pdflatex --version` in a new terminal window

**Error: "ModuleNotFoundError" or "No module named..."**
- Virtual environment is not activated
- Check your terminal prompt shows `(venv)` before the prompt
- Use: `cd backend && venv\Scripts\activate` (Windows)

**Error: "GROQ_API_KEY not found" or API errors**
- `.env` file is missing or not in the `backend/` folder
- Create `backend/.env` with your API key (see Step 2.5 above)
- Ensure the key is valid and has available quota at groq.com

**Error: "Error connecting to Flask backend"**
- Backend server is not running
- Ensure you started the backend with `python app.py`
- Check it's running on `http://127.0.0.1:5000`

### Frontend Issues

**Error: "Cannot find module 'react'"**
- Node.js dependencies are not installed
- Run: `npm install` again in root directory
- Or: Delete `node_modules` folder and `package-lock.json`, then run `npm install`

**Error: "Port 5173 already in use"**
- Another application is using this port
- Option 1: Stop the other application
- Option 2: Use a different port by modifying `vite.config.js`

**Blank page or components not loading**
- Hard refresh: Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (macOS)
- Check browser console (F12 → Console) for errors
- Ensure backend is running and accessible at `http://127.0.0.1:5000`

### General Issues

**"Servers not connecting" or "API calls failing"**
- Ensure both backend and frontend are running in separate terminals
- Backend: Terminal 1 running `python app.py`
- Frontend: Terminal 2 running `npm run dev`
- Check CORS is enabled in backend (already enabled in app.py)

**PDF generation takes too long or fails**
- First-time LaTeX compilation can be slow
- Ensure LaTeX is properly installed: Run `pdflatex --version`
- Check backend terminal for error messages

**Cannot activate virtual environment (Windows)**
- If you see "cannot be loaded because running scripts is disabled"
- Run PowerShell as Administrator
- Then run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
- Try activation again

---

## Available Scripts

### Frontend (Root Directory)
- `npm run dev` - Start development server (http://localhost:5173)
- `npm run build` - Build for production
- `npm run lint` - Run ESLint checks

### Backend (Backend Directory)
- `python app.py` - Start Flask server on http://127.0.0.1:5000
  - Note: Always activate `venv` first using `venv\Scripts\activate`

---

## Important Notes

- **Virtual Environment**: Always activate the virtual environment before running Python commands in backend:
  ```bash
  cd backend
  venv\Scripts\activate  # Windows
  # or
  source venv/bin/activate  # macOS/Linux
  ```
  
- **Both Servers Required**: The app requires both backend and frontend running simultaneously for full functionality

- **LaTeX Installation**: Essential for PDF generation. If you skip this, PDFs won't be generated

- **Gitignore**: The following are excluded from git and recreated locally:
  - `node_modules/` - Created by `npm install`
  - `backend/venv/` - Created by `python -m venv venv`
  - `backend/.env` - Must be created manually with your API key
  - Generated PDF files in `backend/outputs/`

- **First Run**: First LaTeX compilation may take 30-60 seconds as it installs required packages

---

## Support & Issues

If you encounter problems:
1. Check the **Troubleshooting** section above
2. Ensure all prerequisites are installed
3. Verify both servers are running
4. Check terminal outputs for error messages
5. Open an issue in the repository with error details

---

## License
[Add your license here]
