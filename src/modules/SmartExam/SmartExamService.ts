
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile } from "../../types";
import { SmartExam, ExamResultDetailed, CertificateMetadata, ExamType } from "./types";
import { storageService } from "../../services/storageService";
import { executeWithRotation, TEXT_MODELS } from "../../services/geminiService";

// Costs
export const COST_DIAGNOSTIC = 40;
export const COST_CERTIFICATION = 100;

export const SmartExamService = {
    
    async checkBalance(userId: string, type: ExamType): Promise<boolean> {
        const cost = type === 'certification' ? COST_CERTIFICATION : COST_DIAGNOSTIC;
        return await storageService.canRequest(userId, cost);
    },

    async startExam(userId: string, type: ExamType, level: string, lang: string): Promise<SmartExam | null> {
        if (!userId) return null;
        const cost = type === 'certification' ? COST_CERTIFICATION : COST_DIAGNOSTIC;
        
        // 1. Deduct Credits
        const success = await storageService.deductCredits(userId, cost);
        if (!success) return null;

        try {
            // 2. Generate Exam
            const prompt = `
            Génère un examen de type "${type}" pour le niveau "${level}" en "${lang}".
            L'examen doit être rigoureux et professionnel.
            
            Structure requise (JSON) :
            - 3 questions QCM (Reading/Grammar)
            - 1 question Rédaction (Writing) - Sujet court
            - 1 question Mise en situation (Speaking/Acting) - Scénario
            
            Output JSON Schema:
            {
                "sections": [
                    { "id": "q1", "type": "qcm", "question": "...", "options": ["A", "B", "C"], "weight": 1 },
                    ...
                    { "id": "w1", "type": "writing", "question": "...", "weight": 3 },
                    { "id": "s1", "type": "speaking", "question": "...", "weight": 3 }
                ]
            }
            `;

            const response = await executeWithRotation(TEXT_MODELS, async (ai, model) => {
                return await ai.models.generateContent({
                    model,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                sections: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            id: { type: Type.STRING },
                                            type: { type: Type.STRING, enum: ["qcm", "writing", "speaking"] },
                                            question: { type: Type.STRING },
                                            options: { type: Type.ARRAY, items: { type: Type.STRING } },
                                            weight: { type: Type.NUMBER }
                                        },
                                        required: ["id", "type", "question", "weight"]
                                    }
                                }
                            }
                        }
                    }
                });
            });

            const data = JSON.parse(response.text || "{}");
            
            if (!data.sections || !Array.isArray(data.sections) || data.sections.length === 0) {
                throw new Error("Format d'examen invalide (Sections manquantes)");
            }

            return {
                id: crypto.randomUUID(),
                type,
                targetLevel: level,
                sections: data.sections,
                totalQuestions: data.sections.length,
                createdAt: Date.now()
            };

        } catch (e) {
            console.error("Exam Gen Error", e);
            // Rollback credits
            await storageService.addCredits(userId, cost);
            return null;
        }
    },

    async evaluateExam(exam: SmartExam, answers: Record<string, string>, user: UserProfile): Promise<ExamResultDetailed> {
        const prompt = `
        Évalue cet examen pour l'étudiant "${user.username}".
        Niveau visé : ${exam.targetLevel}.
        
        Questions & Réponses :
        ${exam.sections.map(s => `[${s.type.toUpperCase()}] Q: ${s.question} \n R: ${answers[s.id] || "Pas de réponse"}`).join('\n\n')}
        
        Tâche :
        1. Analyse la grammaire, le vocabulaire, la cohérence.
        2. Estime le niveau RÉEL (CEFR) basé sur la performance.
        3. Calcule un score sur 100.
        4. Donne un feedback constructif.
        
        Output JSON.
        `;

        try {
            const response = await executeWithRotation(TEXT_MODELS, async (ai, model) => {
                return await ai.models.generateContent({
                    model,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                globalScore: { type: Type.NUMBER },
                                skillScores: {
                                    type: Type.OBJECT,
                                    properties: {
                                        reading: { type: Type.NUMBER },
                                        writing: { type: Type.NUMBER },
                                        listening: { type: Type.NUMBER },
                                        speaking: { type: Type.NUMBER }
                                    }
                                },
                                detectedLevel: { type: Type.STRING },
                                feedback: { type: Type.STRING },
                                confidenceScore: { type: Type.NUMBER }
                            }
                        }
                    }
                });
            });

            const evalData = JSON.parse(response.text || "{}");
            const passed = evalData.globalScore >= 70; // Seuil strict

            let certId = undefined;
            if (exam.type === 'certification' && passed) {
                certId = `CERT-${Date.now().toString(36).toUpperCase()}-${user.id.slice(0,4).toUpperCase()}`;
                // Save Cert
                await storageService.saveCertificate({
                    id: certId,
                    userId: user.id,
                    userName: user.username,
                    language: user.preferences?.targetLanguage || "Inconnu",
                    level: exam.targetLevel,
                    examId: exam.id,
                    issueDate: Date.now()
                });

                // Notification
                await storageService.createNotification({
                    userId: user.id,
                    type: 'achievement',
                    title: 'Certification Validée !',
                    message: `Félicitations ! Vous avez obtenu le certificat ${exam.targetLevel} en ${user.preferences?.targetLanguage}.`
                });
            }

            return {
                examId: exam.id,
                userId: user.id,
                date: Date.now(),
                globalScore: evalData.globalScore || 0,
                skillScores: evalData.skillScores || { reading: 0, writing: 0, listening: 0, speaking: 0 },
                detectedLevel: evalData.detectedLevel || "Inconnu",
                passed,
                certificateId: certId,
                feedback: evalData.feedback || "Analyse incomplète.",
                confidenceScore: evalData.confidenceScore || 80
            };

        } catch (e) {
            console.error("Eval Error", e);
            throw new Error("Erreur lors de la correction.");
        }
    }
};
