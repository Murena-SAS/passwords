<?php
/**
 * This file is part of the Passwords App
 * created by Marius David Wieschollek
 * and licensed under the AGPL.
 */

namespace OCA\Passwords\Services;

use Exception;
use OCA\Passwords\Db\FolderRevision;
use OCA\Passwords\Exception\ApiException;
use OCA\Passwords\Services\Object\FolderService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use SebastianBergmann\RecursionContext\InvalidArgumentException;

/**
 * Class ValidateFolderTest
 *
 * @package OCA\Passwords\Services
 * @covers  \OCA\Passwords\Services\ValidationService
 */
class ValidateFolderTest extends TestCase {

    /**
     * @var ValidationService
     */
    protected $validationService;
    /**
     * @var UserChallengeService|MockObject
     */
    protected $challengeService;

    /**
     *
     */
    protected function setUp(): void {
        $container               = $this->createMock(ContainerInterface::class);

        $this->challengeService = $this->createMock(UserChallengeService::class);
        $container->method('get')->willReturn($this->challengeService);

        $this->validationService = new ValidationService($container);
    }

    /**
     *
     * ValidateFolder Tests
     *
     */
    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderInvalidSse() {
        $mock = $this->getFolderMock();
        $mock->method('getSseType')->willReturn('invalid');

        try {
            $this->validationService->validateFolder($mock);
            $this->fail("Expected exception");
        } catch(ApiException $e) {
            $this->assertEquals(400, $e->getHttpCode());
            $this->assertEquals('7b584c1e', $e->getId());
            $this->assertEquals('Invalid server side encryption type', $e->getMessage());
        }
    }

    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderInvalidCse() {
        $mock = $this->getFolderMock();

        $mock->method('getSseType')->willReturn(EncryptionService::DEFAULT_SSE_ENCRYPTION);
        $mock->method('getCseType')->willReturn('invalid');

        try {
            $this->validationService->validateFolder($mock);
            $this->fail("Expected exception");
        } catch(ApiException $e) {
            $this->assertEquals(400, $e->getHttpCode());
            $this->assertEquals('4e8162e6', $e->getId());
            $this->assertEquals('Invalid client side encryption type', $e->getMessage());
        }
    }

    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderCseKeyBotNoCse() {
        $mock = $this->getFolderMock();

        $mock->method('getSseType')->willReturn(EncryptionService::DEFAULT_SSE_ENCRYPTION);
        $mock->method('getCseType')->willReturn(EncryptionService::CSE_ENCRYPTION_NONE);
        $mock->method('getCseKey')->willReturn('cse-key');

        try {
            $this->validationService->validateFolder($mock);
            $this->fail("Expected exception");
        } catch(ApiException $e) {
            $this->assertEquals(400, $e->getHttpCode());
            $this->assertEquals('4e8162e6', $e->getId());
            $this->assertEquals('Invalid client side encryption type', $e->getMessage());
        }
    }

    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderNoSseAndCse() {
        $mock = $this->getFolderMock();

        $mock->method('getSseType')->willReturn(EncryptionService::SSE_ENCRYPTION_NONE);
        $mock->method('getCseType')->willReturn(EncryptionService::CSE_ENCRYPTION_NONE);

        try {
            $this->validationService->validateFolder($mock);
            $this->fail("Expected exception");
        } catch(ApiException $e) {
            $this->assertEquals(400, $e->getHttpCode());
            $this->assertEquals('f43e7b82', $e->getId());
            $this->assertEquals('No encryption specified', $e->getMessage());
        }
    }

    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderMissingCseKey() {
        $mock = $this->getFolderMock();
        $this->challengeService->method('hasChallenge')->willReturn(true);
        $mock->method('getSseType')->willReturn(EncryptionService::SSE_ENCRYPTION_NONE);
        $mock->method('getCseType')->willReturn(EncryptionService::CSE_ENCRYPTION_V1R1);
        $mock->method('getCseKey')->willReturn('');

        try {
            $this->validationService->validateFolder($mock);
            $this->fail("Expected exception");
        } catch(ApiException $e) {
            $this->assertEquals(400, $e->getHttpCode());
            $this->assertEquals('fce89df4', $e->getId());
            $this->assertEquals('Client side encryption key missing', $e->getMessage());
        }
    }

    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderEmptyLabel() {
        $mock = $this->getFolderMock();

        $mock->method('getSseType')->willReturn(EncryptionService::DEFAULT_SSE_ENCRYPTION);
        $mock->method('getCseType')->willReturn(EncryptionService::DEFAULT_CSE_ENCRYPTION);

        try {
            $this->validationService->validateFolder($mock);
            $this->fail("Expected exception");
        } catch(ApiException $e) {
            $this->assertEquals(400, $e->getHttpCode());
            $this->assertEquals('7c31eb4d', $e->getId());
            $this->assertEquals('Field "label" can not be empty', $e->getMessage());
        }
    }

    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderSetsSseType() {
        $mock = $this->getFolderMock();

        $mock->expects($this->any())
             ->method('getSseType')
             ->will($this->onConsecutiveCalls('', EncryptionService::DEFAULT_SSE_ENCRYPTION, EncryptionService::DEFAULT_SSE_ENCRYPTION));

        $mock->method('getCseType')->willReturn(EncryptionService::DEFAULT_CSE_ENCRYPTION);
        $mock->method('getLabel')->willReturn('label');
        $mock->method('getParent')->willReturn(FolderService::BASE_FOLDER_UUID);
        $mock->method('getEdited')->willReturn(1);

        $mock->expects($this->once())->method('setSseType')->with(EncryptionService::DEFAULT_SSE_ENCRYPTION);
        $this->validationService->validateFolder($mock);
    }

    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderSetsCseType() {
        $mock = $this->getFolderMock();

        $mock->expects($this->any())
             ->method('getCseType')
             ->will($this->onConsecutiveCalls('', EncryptionService::DEFAULT_CSE_ENCRYPTION, EncryptionService::DEFAULT_CSE_ENCRYPTION, EncryptionService::DEFAULT_CSE_ENCRYPTION, EncryptionService::DEFAULT_CSE_ENCRYPTION, EncryptionService::DEFAULT_CSE_ENCRYPTION));

        $mock->method('getSseType')->willReturn(EncryptionService::DEFAULT_SSE_ENCRYPTION);
        $mock->method('getLabel')->willReturn('label');
        $mock->method('getParent')->willReturn(FolderService::BASE_FOLDER_UUID);
        $mock->method('getEdited')->willReturn(1);

        $mock->expects($this->once())->method('setCseType')->with(EncryptionService::DEFAULT_CSE_ENCRYPTION);
        $this->validationService->validateFolder($mock);
    }

    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderCorrectsInvalidFolderUuid() {
        $mock = $this->getFolderMock();

        $mock->method('getSseType')->willReturn(EncryptionService::DEFAULT_SSE_ENCRYPTION);
        $mock->method('getCseType')->willReturn(EncryptionService::DEFAULT_CSE_ENCRYPTION);
        $mock->method('getLabel')->willReturn('label');
        $mock->method('getParent')->willReturn('1-2-3');
        $mock->method('getEdited')->willReturn(1);

        $mock->expects($this->once())->method('setParent')->with(FolderService::BASE_FOLDER_UUID);
        $this->validationService->validateFolder($mock);
    }

    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderCorrectsFolderParentLoop() {
        $mock = $this->getFolderMock();

        $mock->method('getSseType')->willReturn(EncryptionService::DEFAULT_SSE_ENCRYPTION);
        $mock->method('getCseType')->willReturn(EncryptionService::DEFAULT_CSE_ENCRYPTION);
        $mock->method('getLabel')->willReturn('label');
        $mock->method('getParent')->willReturn('11111111-1111-1111-1111-111111111111');
        $mock->method('getModel')->willReturn('11111111-1111-1111-1111-111111111111');
        $mock->method('getEdited')->willReturn(1);

        $mock->expects($this->once())->method('setParent')->with(FolderService::BASE_FOLDER_UUID);
        $this->validationService->validateFolder($mock);
    }

    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderSetsEditedWhenEmpty() {
        $mock = $this->getFolderMock();

        $mock->method('getSseType')->willReturn(EncryptionService::DEFAULT_SSE_ENCRYPTION);
        $mock->method('getCseType')->willReturn(EncryptionService::DEFAULT_CSE_ENCRYPTION);
        $mock->method('getLabel')->willReturn('label');
        $mock->method('getParent')->willReturn(FolderService::BASE_FOLDER_UUID);
        $mock->method('getEdited')->willReturn(0);

        $mock->expects($this->once())->method('setEdited');
        $this->validationService->validateFolder($mock);
    }

    /**
     * @throws Exception
     * @throws InvalidArgumentException
     */
    public function testValidateFolderSetsEditedWhenInFuture() {
        $mock = $this->getFolderMock();

        $mock->method('getSseType')->willReturn(EncryptionService::DEFAULT_SSE_ENCRYPTION);
        $mock->method('getCseType')->willReturn(EncryptionService::DEFAULT_CSE_ENCRYPTION);
        $mock->method('getLabel')->willReturn('label');
        $mock->method('getParent')->willReturn(FolderService::BASE_FOLDER_UUID);
        $mock->method('getEdited')->willReturn(strtotime('+2 hours'));

        $mock->expects($this->once())->method('setEdited');
        $this->validationService->validateFolder($mock);
    }

    /**
     *
     */
    public function testValidateTagCseUsedButNotAvailable() {
        $mock = $this->getFolderMock();

        $mock->method('getSseType')->willReturn(EncryptionService::DEFAULT_SSE_ENCRYPTION);
        $mock->method('getCseType')->willReturn(EncryptionService::CSE_ENCRYPTION_V1R1);

        try {
            $this->validationService->validateFolder($mock);
            $this->fail("Expected exception");
        } catch(ApiException $e) {
            $this->assertEquals('Invalid client side encryption type', $e->getMessage());
            $this->assertEquals('4e8162e6', $e->getId());
            $this->assertEquals(400, $e->getHttpCode());
        }
    }

    /**
     * @return FolderRevision
     */
    protected function getFolderMock() {
        $mock = $this
            ->getMockBuilder('\OCA\Passwords\Db\FolderRevision')
            ->addMethods(['getSseType', 'setSseType', 'getCseType', 'setCseType', 'getCseKey', 'getHidden', 'getLabel', 'getParent', 'getModel', 'setParent', 'getEdited', 'setEdited'])
            ->getMock();

        $mock->method('getHidden')->willReturn(false);

        return $mock;
    }
}