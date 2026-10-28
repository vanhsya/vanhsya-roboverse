import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { RobotStates, ColorSchemeName, ColorSchemes, EmotionalState, ModeName } from '../types';

interface ThreeCanvasProps {
  robotStates: RobotStates;
  colorScheme: ColorSchemeName;
  averageVolume: number;
  activeSpeaker: 'Cygnus' | 'Lyra' | 'none';
  currentMode: ModeName;
}

const ThreeCanvas: React.FC<ThreeCanvasProps> = ({ robotStates, colorScheme, averageVolume, activeSpeaker, currentMode }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ robotStates, colorScheme, averageVolume, activeSpeaker, currentMode });

  useEffect(() => {
    stateRef.current = { robotStates, colorScheme, averageVolume, activeSpeaker, currentMode };
  }, [robotStates, colorScheme, averageVolume, activeSpeaker, currentMode]);

  useEffect(() => {
    if (!mountRef.current) return;

    let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer;
    let calmRobot: THREE.Group, calmGirlfriend: THREE.Group, globalGroup: THREE.Group;
    let calmRobotHands: THREE.Group, calmGirlfriendHands: THREE.Group, girlfriendHalo: THREE.Mesh;
    let calmRobotLeftEye: THREE.Mesh, calmRobotRightEye: THREE.Mesh;
    let calmGirlfriendLeftEye: THREE.Mesh, calmGirlfriendRightEye: THREE.Mesh;
    let cygnusShoulderArmor: THREE.Group;
    let lyraHandEnergy: THREE.Group;
    let battleFloor: THREE.Mesh, gridHelper: THREE.GridHelper;
    let particles: THREE.Points;
    let networkParticles: THREE.Points, networkLines: THREE.LineSegments;
    const networkParticlesData: { home: THREE.Vector3; velocity: THREE.Vector3; }[] = [];
    const clock = new THREE.Clock();
    let mouse = new THREE.Vector2();
    let mousePosition = new THREE.Vector3();

    const colorSchemes: ColorSchemes = {
        cosmic: [
            new THREE.Color(0x00ffff), new THREE.Color(0xff1493), new THREE.Color(0x39ff14),
            new THREE.Color(0x8a2be2), new THREE.Color(0xffd700), new THREE.Color(0xff4500)
        ],
        romance: [
            new THREE.Color(0xff69b4), new THREE.Color(0xda70d6), new THREE.Color(0xff1493),
            new THREE.Color(0xffc0cb), new THREE.Color(0xff6347), new THREE.Color(0xff00ff)
        ],
        danger: [
            new THREE.Color(0xff0000), new THREE.Color(0xff4500), new THREE.Color(0xff073a),
            new THREE.Color(0xff6347), new THREE.Color(0xff0000), new THREE.Color(0x8b0000)
        ],
        stealth: [
            new THREE.Color(0x00ff99), new THREE.Color(0x00ffff), new THREE.Color(0x00cc66),
            new THREE.Color(0x00ff99), new THREE.Color(0x00ffff), new THREE.Color(0x00cc66)
        ],
        overdrive: [
            new THREE.Color(0xffd700), new THREE.Color(0xff4500), new THREE.Color(0xff1493),
            new THREE.Color(0xffd700), new THREE.Color(0xff4500), new THREE.Color(0xff1493)
        ],
    };

    const emotionColors: Record<EmotionalState, THREE.Color> = {
        stoic: new THREE.Color(0x00ffff),       // Cyan
        empathetic: new THREE.Color(0xff69b4),  // Pink
        curious: new THREE.Color(0xffd700),     // Gold/Yellow
        concerned: new THREE.Color(0xff4500),   // Orange
        playful: new THREE.Color(0x39ff14),     // Green
    };
    
    const init = () => {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a2e);
      scene.fog = new THREE.Fog(0x0a0a2e, 20, 70);

      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.z = 25;
      camera.position.y = 5;

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mountRef.current?.appendChild(renderer.domElement);

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
      hemiLight.position.set(0, 50, 0);
      scene.add(hemiLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
      directionalLight.position.set(20, 25, 15);
      scene.add(directionalLight);

      const pointLight1 = new THREE.PointLight(0xff69b4, 2, 100);
      pointLight1.position.set(15, 10, 15);
      scene.add(pointLight1);
      
      const pointLight2 = new THREE.PointLight(0x00ffff, 2, 100);
      pointLight2.position.set(-15, 10, 15);
      scene.add(pointLight2);
      
      globalGroup = new THREE.Group();
      scene.add(globalGroup);
      
      createAllRobots();
      createCosmicParticleSystem();
      createInteractiveNetwork();
       createBattleArenaFloor();
     };

    const createBattleArenaFloor = () => {
        const floorGeometry = new THREE.CircleGeometry(18, 64);
        const floorMaterial = new THREE.MeshBasicMaterial({
            color: 0x8a2be2,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        battleFloor = new THREE.Mesh(floorGeometry, floorMaterial);
        battleFloor.rotation.x = -Math.PI / 2;
        battleFloor.position.y = -2.8;
        scene.add(battleFloor);

        gridHelper = new THREE.GridHelper(36, 18, 0x00ffff, 0x8a2be2);
gridHelper.position.y = -2.7;
        scene.add(gridHelper);
    }

    const createEnhancedRobot = (config: any) => {
        const robotGroup = new THREE.Group();
        const mainMaterial = new THREE.MeshStandardMaterial({ color: config.bodyColor, metalness: 0.95, roughness: 0.3 });
        const accentMaterial = new THREE.MeshStandardMaterial({ color: config.headColor, metalness: 0.8, roughness: 0.4 });
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: config.eyeColor, emissive: config.eyeColor, emissiveIntensity: 5.0 });

        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * config.size, 1.4 * config.size, 2.8 * config.size, 8), mainMaterial);
        robotGroup.add(torso);

        const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(1.8 * config.size, 1.5 * config.size, 1.5 * config.size), mainMaterial);
        chestPlate.position.y = 0.8 * config.size;
        chestPlate.rotation.y = Math.PI / 4;
        robotGroup.add(chestPlate);
        
        const head = new THREE.Mesh(new THREE.SphereGeometry(1.0 * config.size, 32, 32), accentMaterial);
        head.position.y = 2.5 * config.size;
        robotGroup.add(head);

        calmRobotLeftEye = new THREE.Mesh(new THREE.SphereGeometry(0.25 * config.size, 16, 16), eyeMaterial.clone());
        calmRobotLeftEye.position.set(-0.4 * config.size, 2.6 * config.size, 0.9 * config.size);
        robotGroup.add(calmRobotLeftEye);
        
        calmRobotRightEye = new THREE.Mesh(new THREE.SphereGeometry(0.25 * config.size, 16, 16), eyeMaterial.clone());
        calmRobotRightEye.position.set(0.4 * config.size, 2.6 * config.size, 0.9 * config.size);
        robotGroup.add(calmRobotRightEye);
        
        const eyeSocketMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 1.0, roughness: 0.1 });
        const leftSocket = new THREE.Mesh(new THREE.TorusGeometry(0.3 * config.size, 0.05 * config.size, 8, 32), eyeSocketMaterial);
        leftSocket.position.copy(calmRobotLeftEye.position);
        leftSocket.position.z -= 0.05;
        robotGroup.add(leftSocket);
        const rightSocket = leftSocket.clone();
        rightSocket.position.copy(calmRobotRightEye.position);
        rightSocket.position.z -= 0.05;
        robotGroup.add(rightSocket);

        calmRobotHands = new THREE.Group();
        const createArm = (side: 'left' | 'right') => {
            const armGroup = new THREE.Group();
            const sideMultiplier = side === 'left' ? 1 : -1;

            const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.6 * config.size, 16, 16), mainMaterial);
            shoulder.position.set(-1.2 * sideMultiplier * config.size, 1.0 * config.size, 0);
            armGroup.add(shoulder);

            const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * config.size, 0.3 * config.size, 1.5 * config.size, 12), accentMaterial);
            upperArm.position.set(-1.2 * sideMultiplier * config.size, 0 * config.size, 0);
            upperArm.rotation.z = Math.PI / 6 * sideMultiplier;
            armGroup.add(upperArm);
            
            const hand = new THREE.Mesh(new THREE.BoxGeometry(0.7 * config.size, 0.7 * config.size, 0.7 * config.size), accentMaterial);
            hand.position.set(-1.8 * sideMultiplier * config.size, -0.8 * config.size, 0);
            armGroup.add(hand);

            calmRobotHands.add(hand);
            return armGroup;
        }
        robotGroup.add(createArm('left'));
        robotGroup.add(createArm('right'));

        cygnusShoulderArmor = new THREE.Group();
        const pauldron = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 * config.size, 0), accentMaterial);
        const pauldronLeft = pauldron.clone();
        pauldronLeft.position.set(-2.5, 2.5, 0);
        cygnusShoulderArmor.add(pauldronLeft);
        const pauldronRight = pauldron.clone();
        pauldronRight.position.set(2.5, 2.5, 0);
        cygnusShoulderArmor.add(pauldronRight);
        robotGroup.add(cygnusShoulderArmor);
        
        const base = new THREE.Mesh(new THREE.ConeGeometry(1.5 * config.size, 1 * config.size, 8, 1, true), new THREE.MeshStandardMaterial({color: config.eyeColor, emissive: config.eyeColor, emissiveIntensity: 0.5, transparent: true, opacity: 0.3}));
        base.position.y = -1.8 * config.size;
        robotGroup.add(base);

        return robotGroup;
    };

    const createEnhancedGirlfriendRobot = (config: any) => {
        const robotGroup = new THREE.Group();
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: config.bodyColor, metalness: 0.7, roughness: 0.6, transparent: true, opacity: 0.9 });
        const headMaterial = new THREE.MeshStandardMaterial({ color: config.headColor, metalness: 0.6, roughness: 0.5, emissive: config.headColor, emissiveIntensity: 0.3 });
        const eyeMaterial = new THREE.MeshStandardMaterial({ color: config.eyeColor, emissive: config.eyeColor, emissiveIntensity: 5.0 });

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * config.size, 1.2 * config.size, 3.0 * config.size, 32), bodyMaterial);
        body.position.y = -0.5 * config.size;
        robotGroup.add(body);
        
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.9 * config.size, 32, 32), headMaterial);
        head.position.y = 1.8 * config.size;
        robotGroup.add(head);
        
        calmGirlfriendLeftEye = new THREE.Mesh(new THREE.SphereGeometry(0.2 * config.size, 16, 16), eyeMaterial.clone());
        calmGirlfriendLeftEye.position.set(-0.35 * config.size, 1.9 * config.size, 0.8 * config.size);
        robotGroup.add(calmGirlfriendLeftEye);
        
        calmGirlfriendRightEye = new THREE.Mesh(new THREE.SphereGeometry(0.2 * config.size, 16, 16), eyeMaterial.clone());
        calmGirlfriendRightEye.position.set(0.35 * config.size, 1.9 * config.size, 0.8 * config.size);
        robotGroup.add(calmGirlfriendRightEye);
        
        girlfriendHalo = new THREE.Mesh(new THREE.TorusGeometry(1.2 * config.size, 0.06 * config.size, 8, 100), new THREE.MeshStandardMaterial({ color: config.eyeColor, emissive: config.eyeColor, emissiveIntensity: 3.0 }));
        girlfriendHalo.rotation.x = Math.PI / 2;
        girlfriendHalo.position.y = 2.8 * config.size;
        robotGroup.add(girlfriendHalo);

        calmGirlfriendHands = new THREE.Group();
        const createSlenderArm = (side: 'left' | 'right') => {
            const armGroup = new THREE.Group();
            const sideMultiplier = side === 'left' ? 1 : -1;
            const armMaterial = new THREE.MeshStandardMaterial({ color: config.headColor, metalness: 0.9, roughness: 0.2 });

            const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.15 * config.size, 1.0 * config.size, 4, 16), armMaterial);
            upperArm.position.set(-0.7 * sideMultiplier * config.size, 0.5 * config.size, 0.2);
            upperArm.rotation.z = -Math.PI / 4 * sideMultiplier;
            armGroup.add(upperArm);
            
            const hand = new THREE.Mesh(new THREE.SphereGeometry(0.25 * config.size, 16, 16), armMaterial);
            hand.position.set(-1.3 * sideMultiplier * config.size, -0.1 * config.size, 0.2);
            armGroup.add(hand);
            
            calmGirlfriendHands.add(hand);
            return armGroup;
        };
        robotGroup.add(createSlenderArm('left'));
        robotGroup.add(createSlenderArm('right'));
        
        lyraHandEnergy = new THREE.Group();
        calmGirlfriendHands.children.forEach(hand => {
             const energyParticles = createEnergyVortex(config.eyeColor);
             hand.add(energyParticles);
        });
        robotGroup.add(lyraHandEnergy);

        const baseMaterial = new THREE.MeshStandardMaterial({ color: config.bodyColor, emissive: config.bodyColor, emissiveIntensity: 0.8, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
        const base = new THREE.Mesh(new THREE.ConeGeometry(1.5 * config.size, 1.5 * config.size, 32, 1, true), baseMaterial);
        base.position.y = -2.5 * config.size;
        robotGroup.add(base);

        return robotGroup;
    };
    
    const createEnergyVortex = (color: number) => {
        const particleCount = 50;
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        for (let i = 0; i < particleCount; i++) {
            positions.push( (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: color,
            size: 0.05,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.9
        });
        const vortex = new THREE.Points(geometry, material);
        return vortex;
    };


    const createAllRobots = () => {
        calmRobot = createEnhancedRobot({ bodyColor: 0x9370db, headColor: 0xb19cd9, eyeColor: 0x00ffff, size: 1.0 });
        calmRobot.name = "Cygnus";
        calmRobot.position.set(-8, 0, 0);
        globalGroup.add(calmRobot);
        
        calmGirlfriend = createEnhancedGirlfriendRobot({ bodyColor: 0x00ff99, headColor: 0x00ffff, eyeColor: 0xff69b4, size: 0.9 });
        calmGirlfriend.name = "Lyra";
        calmGirlfriend.position.set(8, 0, 0);
        globalGroup.add(calmGirlfriend);
    };

    const createCosmicParticleSystem = () => {
        const particleCount = 2000;
        const pMaterial = new THREE.PointsMaterial({ size: 0.1, vertexColors: true, transparent: true, opacity: 0.8 });
        const particlesGeometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        for (let i = 0; i < particleCount; i++) {
            const x = (Math.random() - 0.5) * 100;
            const y = (Math.random() - 0.5) * 100;
            const z = (Math.random() - 0.5) * 100;
            positions.push(x, y, z);
            const color = new THREE.Color();
            color.setHSL(Math.random(), 1.0, 0.5);
            colors.push(color.r, color.g, color.b);
        }
        particlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        particlesGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        particles = new THREE.Points(particlesGeometry, pMaterial);
        scene.add(particles);
    };
    
    const createInteractiveNetwork = () => {
        const particleCount = 200;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = [];
        for (let i = 0; i < particleCount; i++) {
            const x = Math.random() * 80 - 40;
            const y = Math.random() * 80 - 40;
            const z = Math.random() * 80 - 40;
            positions.push(x, y, z);
            networkParticlesData.push({
                home: new THREE.Vector3(x, y, z),
                velocity: new THREE.Vector3((Math.random() - 0.5) * 0.005, (Math.random() - 0.5) * 0.005, (Math.random() - 0.5) * 0.005)
            });
        }
        particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const particleMaterial = new THREE.PointsMaterial({ color: 0xF0F0F0, size: 0.2, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.8 });
        networkParticles = new THREE.Points(particleGeometry, particleMaterial);
        scene.add(networkParticles);

        const maxLines = particleCount * 4;
        const linePositions = new Float32Array(maxLines * 3 * 2);
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0xC084FC, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending });
        networkLines = new THREE.LineSegments(lineGeometry, lineMaterial);
        scene.add(networkLines);
    };

    const animate = () => {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();
        const time = clock.getElapsedTime();
        const { robotStates: currentStates, colorScheme: currentScheme, averageVolume: currentVolume, activeSpeaker: currentSpeaker, currentMode } = stateRef.current;
        
        const dangerColor = new THREE.Color(0xff0000);
        const dangerBg = new THREE.Color(0x1a0000);
        const dangerFog = new THREE.Color(0x0d0000);
        const stealthBg = new THREE.Color(0x020505);
        const stealthFog = new THREE.Color(0x000000);
        const overdriveBg = new THREE.Color(0x0d051a);
        const overdriveFog = new THREE.Color(0x05000d);
        
        if (currentStates.isDangerMode || currentMode === 'danger') {
            scene.background.lerp(dangerBg, 0.05);
            scene.fog.color.lerp(dangerFog, 0.05);
            if (gridHelper) {
                gridHelper.material.color.lerp(dangerColor, 0.05);
            }
            if (battleFloor) {
                (battleFloor.material as THREE.MeshBasicMaterial).color.lerp(dangerColor, 0.05);
            }
            // Screen shake effect
            const shakeIntensity = 0.1;
            camera.position.x += (Math.random() - 0.5) * shakeIntensity;
            camera.position.y += (Math.random() - 0.5) * shakeIntensity;
        } else if (currentMode === 'stealth') {
            scene.background.lerp(stealthBg, 0.05);
            scene.fog.color.lerp(stealthFog, 0.05);
            if (gridHelper) {
                gridHelper.material.color.lerp(new THREE.Color(0x00ff99), 0.05);
            }
            if (battleFloor) {
                (battleFloor.material as THREE.MeshBasicMaterial).color.lerp(new THREE.Color(0x00ff99), 0.05);
            }
        } else if (currentMode === 'overdrive') {
            scene.background.lerp(overdriveBg, 0.05);
            scene.fog.color.lerp(overdriveFog, 0.05);
            if (gridHelper) {
                gridHelper.material.color.lerp(new THREE.Color(0xffd700), 0.05);
            }
            if (battleFloor) {
                (battleFloor.material as THREE.MeshBasicMaterial).color.lerp(new THREE.Color(0xffd700), 0.05);
            }
        } else {
            scene.background.lerp(new THREE.Color(0x0a0a2e), 0.05);
            scene.fog.color.lerp(new THREE.Color(0x0a0a2e), 0.05);
            if (gridHelper) {
                gridHelper.material.color.lerp(new THREE.Color(0x00ffff), 0.05);
            }
            if (battleFloor) {
                (battleFloor.material as THREE.MeshBasicMaterial).color.lerp(new THREE.Color(0x8a2be2), 0.05);
            }
        }
        
        calmRobot.position.lerp(new THREE.Vector3(-8, 0, 0), 0.1);
        calmGirlfriend.position.lerp(new THREE.Vector3(8, 0, 0), 0.1);
        
        const audioInfluence = Math.min(currentVolume / 100, 1.0);
        const energeticHover = Math.sin(time * 5) * 0.15;
        calmRobot.position.y = 0 + audioInfluence * 1.5 + energeticHover;
        calmGirlfriend.position.y = 0 + audioInfluence * 1.5 - energeticHover;

        calmRobot.rotation.y += (mouse.x * 0.5 - calmRobot.rotation.y) * 0.05;
        calmGirlfriend.rotation.y += (mouse.x * 0.5 - calmGirlfriend.rotation.y) * 0.05;

        if(cygnusShoulderArmor) {
            cygnusShoulderArmor.rotation.y = time * 0.4;
        }

        // Talking and emotion animation
        const eyeIntensity = 5 + audioInfluence * 15;
        const cygnusTargetColor = emotionColors[currentStates.cygnusEmotion] || emotionColors.stoic;
        const lyraTargetColor = emotionColors[currentStates.lyraEmotion] || emotionColors.empathetic;

        (calmRobotLeftEye.material as THREE.MeshStandardMaterial).emissive.lerp(cygnusTargetColor, 0.1);
        (calmRobotRightEye.material as THREE.MeshStandardMaterial).emissive.lerp(cygnusTargetColor, 0.1);
        (calmGirlfriendLeftEye.material as THREE.MeshStandardMaterial).emissive.lerp(lyraTargetColor, 0.1);
        (calmGirlfriendRightEye.material as THREE.MeshStandardMaterial).emissive.lerp(lyraTargetColor, 0.1);

        (calmRobotLeftEye.material as THREE.MeshStandardMaterial).color.lerp(cygnusTargetColor, 0.1);
        (calmRobotRightEye.material as THREE.MeshStandardMaterial).color.lerp(cygnusTargetColor, 0.1);
        (calmGirlfriendLeftEye.material as THREE.MeshStandardMaterial).color.lerp(lyraTargetColor, 0.1);
        (calmGirlfriendRightEye.material as THREE.MeshStandardMaterial).color.lerp(lyraTargetColor, 0.1);
        
        (calmRobotLeftEye.material as THREE.MeshStandardMaterial).emissiveIntensity = THREE.MathUtils.lerp((calmRobotLeftEye.material as THREE.MeshStandardMaterial).emissiveIntensity, currentSpeaker === 'Cygnus' ? 25 : eyeIntensity, 0.1);
        (calmRobotRightEye.material as THREE.MeshStandardMaterial).emissiveIntensity = THREE.MathUtils.lerp((calmRobotRightEye.material as THREE.MeshStandardMaterial).emissiveIntensity, currentSpeaker === 'Cygnus' ? 25 : eyeIntensity, 0.1);
        (calmGirlfriendLeftEye.material as THREE.MeshStandardMaterial).emissiveIntensity = THREE.MathUtils.lerp((calmGirlfriendLeftEye.material as THREE.MeshStandardMaterial).emissiveIntensity, currentSpeaker === 'Lyra' ? 25 : eyeIntensity, 0.1);
        (calmGirlfriendRightEye.material as THREE.MeshStandardMaterial).emissiveIntensity = THREE.MathUtils.lerp((calmGirlfriendRightEye.material as THREE.MeshStandardMaterial).emissiveIntensity, currentSpeaker === 'Lyra' ? 25 : eyeIntensity, 0.1);

        if (calmRobotHands) {
            calmRobotHands.children.forEach((hand, i) => {
                hand.rotation.x = Math.sin(time * 2 + i) * 0.2;
            });
        }
        if (calmGirlfriendHands) {
            calmGirlfriendHands.children.forEach((hand, i) => {
                 const energy = hand.children[0];
                 if(energy) energy.rotation.y = time * 3;
            });
        }
        if (girlfriendHalo) {
            girlfriendHalo.rotation.z = time * 0.8;
            const haloMaterial = girlfriendHalo.material as THREE.MeshStandardMaterial;
            haloMaterial.emissiveIntensity = 3.0 + Math.sin(time * 4) * 2.0;
        }

        if (battleFloor) {
            (battleFloor.material as THREE.MeshBasicMaterial).opacity = 0.15 + (Math.sin(time * 2) + 1) / 2 * 0.15;
        }

        // Colored particle system animation
        if (particles) {
            particles.rotation.y += delta * 0.05;
            const colorsAttribute = particles.geometry.attributes.color as THREE.BufferAttribute;
            const scheme = currentStates.isDangerMode ? colorSchemes.danger : colorSchemes[currentScheme];
            const colorIndex = Math.floor(time * 0.5) % scheme.length;
            const nextColorIndex = (colorIndex + 1) % scheme.length;
            const t = (time * 0.5) % 1;
            const baseColor = new THREE.Color().lerpColors(scheme[colorIndex], scheme[nextColorIndex], t);
            for (let i = 0; i < colorsAttribute.count; i++) {
                colorsAttribute.setXYZ(i, baseColor.r, baseColor.g, baseColor.b);
            }
            colorsAttribute.needsUpdate = true;
        }
        
        // Interactive network animation
        if (networkParticles && networkLines) {
            const positions = networkParticles.geometry.attributes.position.array;
            const linePositions = networkLines.geometry.attributes.position.array as Float32Array;
            let lineIndex = 0;
            const mouseInfluenceRadius = 20; // Increased radius
            const slomoFactor = 0.02;

            for (let i = 0; i < networkParticlesData.length; i++) {
                const i3 = i * 3;
                const particle = networkParticlesData[i];
                const distanceToMouse = new THREE.Vector3(positions[i3], positions[i3 + 1], positions[i3 + 2]).distanceTo(mousePosition);
                let targetX = particle.home.x;
                let targetY = particle.home.y;
                if (distanceToMouse < mouseInfluenceRadius) {
                    const influence = (1 - distanceToMouse / mouseInfluenceRadius);
                    targetX = mousePosition.x * influence * 2; // Stronger pull
                    targetY = mousePosition.y * influence * 2;
                }
                positions[i3] += (targetX - positions[i3]) * slomoFactor + particle.velocity.x;
                positions[i3 + 1] += (targetY - positions[i3 + 1]) * slomoFactor + particle.velocity.y;
                positions[i3 + 2] += particle.velocity.z;

                if (Math.abs(positions[i3]) > 40) particle.velocity.x *= -1;
                if (Math.abs(positions[i3 + 1]) > 40) particle.velocity.y *= -1;
                if (Math.abs(positions[i3 + 2]) > 40) particle.velocity.z *= -1;
            }
            networkParticles.geometry.attributes.position.needsUpdate = true;

            for (let i = 0; i < networkParticlesData.length; i++) {
                for (let j = i + 1; j < networkParticlesData.length; j++) {
                    const dx = positions[i * 3] - positions[j * 3];
                    const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
                    const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
                    const distSq = dx * dx + dy * dy + dz * dz;
                    if (distSq < 100) {
                        linePositions[lineIndex++] = positions[i * 3];
                        linePositions[lineIndex++] = positions[i * 3 + 1];
                        linePositions[lineIndex++] = positions[i * 3 + 2];
                        linePositions[lineIndex++] = positions[j * 3];
                        linePositions[lineIndex++] = positions[j * 3 + 1];
                        linePositions[lineIndex++] = positions[j * 3 + 2];
                    }
                }
            }
            networkLines.geometry.setDrawRange(0, lineIndex / 3);
            networkLines.geometry.attributes.position.needsUpdate = true;
        }

        camera.position.x += (mouse.x * 5 - camera.position.x) * 0.05;
        camera.position.y += (-mouse.y * 5 - (camera.position.y - 5)) * 0.05;
        camera.lookAt(scene.position);

        renderer.render(scene, camera);
    };

    const onWindowResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const onDocumentMouseMove = (event: MouseEvent) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        mousePosition.x = mouse.x * 15;
        mousePosition.y = mouse.y * 15;
    };

    init();
    animate();

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('mousemove', onDocumentMouseMove);

    return () => {
        window.removeEventListener('resize', onWindowResize);
        document.removeEventListener('mousemove', onDocumentMouseMove);
        mountRef.current?.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="fixed top-0 left-0 w-full h-full z-0" />;
};

export default ThreeCanvas;